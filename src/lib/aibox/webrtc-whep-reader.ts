// Client WHEP (WebRTC) đọc stream từ MediaMTX — port TypeScript từ reader.js
// chính thức của MediaMTX v1.20.0 (bluenviron/mediamtx, MIT license), giữ
// nguyên logic. Lý do vendor thay vì tự viết: flow WHEP không tầm thường
// (OPTIONS lấy ICE servers qua header Link → offer recvonly → POST
// application/sdp → 201 + Location làm session URL → trickle ICE qua PATCH →
// DELETE khi đóng), kèm retry và sửa SDP cho codec không quảng bá — client
// chính chủ đã xử lý đủ các case này khớp với server.
//
// Chỉ chạy phía trình duyệt (RTCPeerConnection, window) — import từ component
// "use client" và khởi tạo trong useEffect.

export interface WhepReaderConf {
  /** URL tuyệt đối của endpoint WHEP, vd http://localhost:8889/cam01/whep. */
  url: string;
  /** Basic auth (tuỳ chọn — media plane dev không bật auth). */
  user?: string;
  pass?: string;
  /** Bearer token (tuỳ chọn, dùng ở Phase 2 nếu bật auth JWT). */
  token?: string;
  onError?: (err: string) => void;
  onTrack?: (evt: RTCTrackEvent) => void;
}

interface OfferData {
  iceUfrag: string;
  icePwd: string;
  medias: string[];
}

type ReaderState = "getting_codecs" | "running" | "restarting" | "closed" | "failed";

export class MediaMTXWebRTCReader {
  private static RETRY_PAUSE = 2000;

  private conf: WhepReaderConf;
  private state: ReaderState = "getting_codecs";
  private restartTimeout: number | null = null;
  private pc: RTCPeerConnection | null = null;
  private offerData: OfferData | null = null;
  private sessionUrl: string | null = null;
  private queuedCandidates: RTCIceCandidate[] = [];
  private nonAdvertisedCodecs: string[] = [];

  constructor(conf: WhepReaderConf) {
    this.conf = conf;
    this.getNonAdvertisedCodecs();
  }

  /** Đóng reader và giải phóng tài nguyên (gọi trong cleanup của useEffect). */
  close(): void {
    this.state = "closed";

    if (this.pc !== null) {
      this.pc.close();
    }

    if (this.restartTimeout !== null) {
      clearTimeout(this.restartTimeout);
    }

    if (this.sessionUrl !== null) {
      // DELETE session để MediaMTX dọn ngay thay vì đợi timeout.
      void fetch(this.sessionUrl, { method: "DELETE" }).catch(() => undefined);
      this.sessionUrl = null;
    }
  }

  private static supportsNonAdvertisedCodec(codec: string, fmtp?: string): Promise<boolean> {
    return new Promise((resolve) => {
      const pc = new RTCPeerConnection({ iceServers: [] });
      const mediaType = "audio";
      let payloadType = "";

      pc.addTransceiver(mediaType, { direction: "recvonly" });
      pc.createOffer()
        .then((offer) => {
          if (offer.sdp === undefined) {
            throw new Error("SDP not present");
          }
          if (offer.sdp.includes(` ${codec}`)) {
            // codec đã được quảng bá sẵn, không cần thêm thủ công
            throw new Error("already present");
          }

          const sections = offer.sdp.split(`m=${mediaType}`);

          const payloadTypes = sections
            .slice(1)
            .map((s) => s.split("\r\n")[0].split(" ").slice(3))
            .reduce((prev, cur) => [...prev, ...cur], []);
          payloadType = this.reservePayloadType(payloadTypes);

          const lines = sections[1].split("\r\n");
          lines[0] += ` ${payloadType}`;
          lines.splice(lines.length - 1, 0, `a=rtpmap:${payloadType} ${codec}`);
          if (fmtp !== undefined) {
            lines.splice(lines.length - 1, 0, `a=fmtp:${payloadType} ${fmtp}`);
          }
          sections[1] = lines.join("\r\n");
          offer.sdp = sections.join(`m=${mediaType}`);
          return pc.setLocalDescription(offer);
        })
        .then(() =>
          pc.setRemoteDescription(
            new RTCSessionDescription({
              type: "answer",
              sdp:
                "v=0\r\n" +
                "o=- 6539324223450680508 0 IN IP4 0.0.0.0\r\n" +
                "s=-\r\n" +
                "t=0 0\r\n" +
                "a=fingerprint:sha-256 0D:9F:78:15:42:B5:4B:E6:E2:94:3E:5B:37:78:E1:4B:54:59:A3:36:3A:E5:05:EB:27:EE:8F:D2:2D:41:29:25\r\n" +
                `m=${mediaType} 9 UDP/TLS/RTP/SAVPF ${payloadType}\r\n` +
                "c=IN IP4 0.0.0.0\r\n" +
                "a=ice-pwd:7c3bf4770007e7432ee4ea4d697db675\r\n" +
                "a=ice-ufrag:29e036dc\r\n" +
                "a=sendonly\r\n" +
                "a=rtcp-mux\r\n" +
                `a=rtpmap:${payloadType} ${codec}\r\n` +
                (fmtp !== undefined ? `a=fmtp:${payloadType} ${fmtp}\r\n` : "")
            })
          )
        )
        .then(() => {
          resolve(true);
        })
        .catch(() => {
          resolve(false);
        })
        .finally(() => {
          pc.close();
        });
    });
  }

  private static unquoteCredential(v: string): string {
    return JSON.parse(`"${v}"`) as string;
  }

  private static linkToIceServers(links: string | null): RTCIceServer[] {
    return links !== null
      ? links.split(", ").map((link) => {
          const m = link.match(
            /^<(.+?)>; rel="ice-server"(; username="(.*?)"; credential="(.*?)"; credential-type="password")?/i
          ) as RegExpMatchArray;
          const ret: RTCIceServer = {
            urls: [m[1]]
          };

          if (m[3] !== undefined) {
            ret.username = this.unquoteCredential(m[3]);
            ret.credential = this.unquoteCredential(m[4]);
          }

          return ret;
        })
      : [];
  }

  private static parseOffer(sdp: string): OfferData {
    const ret: OfferData = {
      iceUfrag: "",
      icePwd: "",
      medias: []
    };

    for (const line of sdp.split("\r\n")) {
      if (line.startsWith("m=")) {
        ret.medias.push(line.slice("m=".length));
      } else if (ret.iceUfrag === "" && line.startsWith("a=ice-ufrag:")) {
        ret.iceUfrag = line.slice("a=ice-ufrag:".length);
      } else if (ret.icePwd === "" && line.startsWith("a=ice-pwd:")) {
        ret.icePwd = line.slice("a=ice-pwd:".length);
      }
    }

    return ret;
  }

  private static reservePayloadType(payloadTypes: string[]): string {
    // hợp lệ trong 30..127, trừ khoảng 64..95
    // https://chromium.googlesource.com/external/webrtc/+/refs/heads/master/call/payload_type.h#29
    for (let i = 30; i <= 127; i++) {
      if ((i <= 63 || i >= 96) && !payloadTypes.includes(i.toString())) {
        const pl = i.toString();
        payloadTypes.push(pl);
        return pl;
      }
    }
    throw Error("unable to find a free payload type");
  }

  private static enableStereoPcmau(payloadTypes: string[], section: string): string {
    const lines = section.split("\r\n");

    let payloadType = this.reservePayloadType(payloadTypes);
    lines[0] += ` ${payloadType}`;
    lines.splice(lines.length - 1, 0, `a=rtpmap:${payloadType} PCMU/8000/2`);
    lines.splice(lines.length - 1, 0, `a=rtcp-fb:${payloadType} transport-cc`);

    payloadType = this.reservePayloadType(payloadTypes);
    lines[0] += ` ${payloadType}`;
    lines.splice(lines.length - 1, 0, `a=rtpmap:${payloadType} PCMA/8000/2`);
    lines.splice(lines.length - 1, 0, `a=rtcp-fb:${payloadType} transport-cc`);

    return lines.join("\r\n");
  }

  private static enableMultichannelOpus(payloadTypes: string[], section: string): string {
    const lines = section.split("\r\n");

    const variants: Array<[string, string]> = [
      ["multiopus/48000/3", "channel_mapping=0,2,1;num_streams=2;coupled_streams=1"],
      ["multiopus/48000/4", "channel_mapping=0,1,2,3;num_streams=2;coupled_streams=2"],
      ["multiopus/48000/5", "channel_mapping=0,4,1,2,3;num_streams=3;coupled_streams=2"],
      ["multiopus/48000/6", "channel_mapping=0,4,1,2,3,5;num_streams=4;coupled_streams=2"],
      ["multiopus/48000/7", "channel_mapping=0,4,1,2,3,5,6;num_streams=4;coupled_streams=4"],
      ["multiopus/48000/8", "channel_mapping=0,6,1,4,5,2,3,7;num_streams=5;coupled_streams=4"]
    ];

    for (const [rtpmap, fmtp] of variants) {
      const payloadType = this.reservePayloadType(payloadTypes);
      lines[0] += ` ${payloadType}`;
      lines.splice(lines.length - 1, 0, `a=rtpmap:${payloadType} ${rtpmap}`);
      lines.splice(lines.length - 1, 0, `a=fmtp:${payloadType} ${fmtp}`);
      lines.splice(lines.length - 1, 0, `a=rtcp-fb:${payloadType} transport-cc`);
    }

    return lines.join("\r\n");
  }

  private static enableL16(payloadTypes: string[], section: string): string {
    const lines = section.split("\r\n");

    for (const rtpmap of ["L16/8000/2", "L16/16000/2", "L16/48000/2"]) {
      const payloadType = this.reservePayloadType(payloadTypes);
      lines[0] += ` ${payloadType}`;
      lines.splice(lines.length - 1, 0, `a=rtpmap:${payloadType} ${rtpmap}`);
      lines.splice(lines.length - 1, 0, `a=rtcp-fb:${payloadType} transport-cc`);
    }

    return lines.join("\r\n");
  }

  private static enableStereoOpus(section: string): string {
    let opusPayloadFormat = "";
    const lines = section.split("\r\n");

    for (let i = 0; i < lines.length; i++) {
      if (lines[i].startsWith("a=rtpmap:") && lines[i].toLowerCase().includes("opus/")) {
        opusPayloadFormat = lines[i].slice("a=rtpmap:".length).split(" ")[0];
        break;
      }
    }

    if (opusPayloadFormat === "") {
      return section;
    }

    for (let i = 0; i < lines.length; i++) {
      if (lines[i].startsWith(`a=fmtp:${opusPayloadFormat} `)) {
        if (!lines[i].includes("stereo")) {
          lines[i] += ";stereo=1";
        }
        if (!lines[i].includes("sprop-stereo")) {
          lines[i] += ";sprop-stereo=1";
        }
      }
    }

    return lines.join("\r\n");
  }

  private static editOffer(sdp: string, nonAdvertisedCodecs: string[]): string {
    const sections = sdp.split("m=");

    const payloadTypes = sections
      .slice(1)
      .map((s) => s.split("\r\n")[0].split(" ").slice(3))
      .reduce((prev, cur) => [...prev, ...cur], []);

    for (let i = 1; i < sections.length; i++) {
      if (sections[i].startsWith("audio")) {
        sections[i] = this.enableStereoOpus(sections[i]);

        if (nonAdvertisedCodecs.includes("pcma/8000/2")) {
          sections[i] = this.enableStereoPcmau(payloadTypes, sections[i]);
        }
        if (nonAdvertisedCodecs.includes("multiopus/48000/6")) {
          sections[i] = this.enableMultichannelOpus(payloadTypes, sections[i]);
        }
        if (nonAdvertisedCodecs.includes("L16/48000/2")) {
          sections[i] = this.enableL16(payloadTypes, sections[i]);
        }

        break;
      }
    }

    return sections.join("m=");
  }

  private static generateSdpFragment(od: OfferData, candidates: RTCIceCandidate[]): string {
    const candidatesByMedia: Record<number, RTCIceCandidate[]> = {};
    for (const candidate of candidates) {
      const mid = candidate.sdpMLineIndex as number;
      if (candidatesByMedia[mid] === undefined) {
        candidatesByMedia[mid] = [];
      }
      candidatesByMedia[mid].push(candidate);
    }

    let frag = `a=ice-ufrag:${od.iceUfrag}\r\n` + `a=ice-pwd:${od.icePwd}\r\n`;

    let mid = 0;

    for (const media of od.medias) {
      if (candidatesByMedia[mid] !== undefined) {
        frag += `m=${media}\r\n` + `a=mid:${mid}\r\n`;

        for (const candidate of candidatesByMedia[mid]) {
          frag += `a=${candidate.candidate}\r\n`;
        }
      }
      mid++;
    }

    return frag;
  }

  private handleError(err: string): void {
    if (this.state === "running") {
      if (this.pc !== null) {
        this.pc.close();
        this.pc = null;
      }

      this.offerData = null;

      if (this.sessionUrl !== null) {
        void fetch(this.sessionUrl, { method: "DELETE" }).catch(() => undefined);
        this.sessionUrl = null;
      }

      this.queuedCandidates = [];
      this.state = "restarting";

      this.restartTimeout = window.setTimeout(() => this.restart(), MediaMTXWebRTCReader.RETRY_PAUSE);

      if (this.conf.onError !== undefined) {
        this.conf.onError(`${err}, retrying in some seconds`);
      }
    } else if (this.state === "getting_codecs") {
      this.state = "failed";

      if (this.conf.onError !== undefined) {
        this.conf.onError(err);
      }
    }
  }

  private restart(): void {
    this.restartTimeout = null;
    this.state = "running";
    this.start();
  }

  private getNonAdvertisedCodecs(): void {
    Promise.all(
      (
        [
          ["pcma/8000/2", undefined],
          ["multiopus/48000/6", "channel_mapping=0,4,1,2,3,5;num_streams=4;coupled_streams=2"],
          ["L16/48000/2", undefined]
        ] as Array<[string, string | undefined]>
      ).map(([codec, fmtp]) =>
        MediaMTXWebRTCReader.supportsNonAdvertisedCodec(codec, fmtp).then((r) => (r ? codec : false))
      )
    )
      .then((c) => c.filter((e): e is string => e !== false))
      .then((codecs) => {
        if (this.state !== "getting_codecs") {
          throw new Error("closed");
        }

        this.nonAdvertisedCodecs = codecs;
        this.state = "running";
        this.start();
      })
      .catch((err: Error) => {
        this.handleError(err.toString());
      });
  }

  private start(): void {
    this.requestICEServers()
      .then((iceServers) => this.setupPeerConnection(iceServers))
      .then((offer) => this.sendOffer(offer))
      .then((answer) => this.setAnswer(answer))
      .catch((err: Error) => {
        this.handleError(err.toString());
      });
  }

  private authHeader(): Record<string, string> {
    if (this.conf.user !== undefined && this.conf.user !== "") {
      const credentials = btoa(`${this.conf.user}:${this.conf.pass ?? ""}`);
      return { Authorization: `Basic ${credentials}` };
    }
    if (this.conf.token !== undefined && this.conf.token !== "") {
      return { Authorization: `Bearer ${this.conf.token}` };
    }
    return {};
  }

  private requestICEServers(): Promise<RTCIceServer[]> {
    return fetch(this.conf.url, {
      method: "OPTIONS",
      headers: this.authHeader()
    }).then((res) => MediaMTXWebRTCReader.linkToIceServers(res.headers.get("Link")));
  }

  private setupPeerConnection(iceServers: RTCIceServer[]): Promise<string> {
    if (this.state !== "running") {
      throw new Error("closed");
    }

    this.pc = new RTCPeerConnection({ iceServers });

    const direction = "recvonly" as const;
    this.pc.addTransceiver("video", { direction });
    this.pc.addTransceiver("audio", { direction });

    // dùng data channel yêu cầu tạo một data channel phía local
    this.pc.createDataChannel("");

    this.pc.onicecandidate = (evt) => this.onLocalCandidate(evt);
    this.pc.onconnectionstatechange = () => this.onConnectionState();
    this.pc.ontrack = (evt) => this.onTrack(evt);

    return this.pc.createOffer().then((offer) => {
      offer.sdp = MediaMTXWebRTCReader.editOffer(offer.sdp as string, this.nonAdvertisedCodecs);
      this.offerData = MediaMTXWebRTCReader.parseOffer(offer.sdp);

      return (this.pc as RTCPeerConnection).setLocalDescription(offer).then(() => offer.sdp as string);
    });
  }

  private sendOffer(offer: string): Promise<string> {
    if (this.state !== "running") {
      throw new Error("closed");
    }

    return fetch(this.conf.url, {
      method: "POST",
      headers: {
        ...this.authHeader(),
        "Content-Type": "application/sdp"
      },
      body: offer
    }).then((res) => {
      switch (res.status) {
        case 201:
          break;
        case 404:
          throw new Error("stream not found");
        case 400:
          return res.json().then((e: { error: string }) => {
            throw new Error(e.error);
          });
        default:
          throw new Error(`bad status code ${res.status}`);
      }

      this.sessionUrl = new URL(res.headers.get("location") as string, this.conf.url).toString();

      return res.text();
    });
  }

  private setAnswer(answer: string): Promise<void> {
    if (this.state !== "running") {
      throw new Error("closed");
    }

    return (this.pc as RTCPeerConnection)
      .setRemoteDescription(new RTCSessionDescription({ type: "answer", sdp: answer }))
      .then(() => {
        if (this.state !== "running") {
          return;
        }

        if (this.queuedCandidates.length !== 0) {
          this.sendLocalCandidates(this.queuedCandidates);
          this.queuedCandidates = [];
        }
      });
  }

  private onLocalCandidate(evt: RTCPeerConnectionIceEvent): void {
    if (this.state !== "running") {
      return;
    }

    if (evt.candidate !== null) {
      if (this.sessionUrl === null) {
        this.queuedCandidates.push(evt.candidate);
      } else {
        this.sendLocalCandidates([evt.candidate]);
      }
    }
  }

  private sendLocalCandidates(candidates: RTCIceCandidate[]): void {
    fetch(this.sessionUrl as string, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/trickle-ice-sdpfrag",
        "If-Match": "*"
      },
      body: MediaMTXWebRTCReader.generateSdpFragment(this.offerData as OfferData, candidates)
    })
      .then((res) => {
        switch (res.status) {
          case 204:
            break;
          case 404:
            throw new Error("stream not found");
          default:
            throw new Error(`bad status code ${res.status}`);
        }
      })
      .catch((err: Error) => {
        this.handleError(err.toString());
      });
  }

  private onConnectionState(): void {
    if (this.state !== "running") {
      return;
    }

    // "closed" có thể tới trước "failed" mà close() chưa hề được gọi —
    // xảy ra khi phía kia gửi thông điệp kết thúc kiểu DTLS CloseNotify.
    const st = (this.pc as RTCPeerConnection).connectionState;
    if (st === "failed" || st === "closed") {
      this.handleError("peer connection closed");
    }
  }

  private onTrack(evt: RTCTrackEvent): void {
    if (this.conf.onTrack !== undefined) {
      this.conf.onTrack(evt);
    }
  }
}
