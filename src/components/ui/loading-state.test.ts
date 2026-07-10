import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { LoadingState } from "./loading-state";

describe("LoadingState", () => {
  it("renders a Vietnamese default loading message", () => {
    const markup = renderToStaticMarkup(React.createElement(LoadingState));

    expect(markup).toContain("Đang tải dữ liệu");
    expect(markup).toContain("Vui lòng chờ trong giây lát");
  });

  it("renders the requested number of skeleton rows", () => {
    const markup = renderToStaticMarkup(React.createElement(LoadingState, { rows: 4 }));

    expect(markup.match(/data-slot="loading-skeleton"/g)).toHaveLength(4);
  });
});
