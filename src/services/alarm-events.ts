export interface AlarmRealtimeEvent {
  type: "alarm-created";
  id: string;
  occurredAt: string;
}

export type AlarmEventSubscriber = (event: AlarmRealtimeEvent) => void;

const globalAlarmEvents = globalThis as typeof globalThis & {
  __aiboxAlarmEventSubscribers?: Set<AlarmEventSubscriber>;
};

function getSubscribers(): Set<AlarmEventSubscriber> {
  if (!globalAlarmEvents.__aiboxAlarmEventSubscribers) {
    globalAlarmEvents.__aiboxAlarmEventSubscribers = new Set();
  }

  return globalAlarmEvents.__aiboxAlarmEventSubscribers;
}

export function subscribeToAlarmEvents(subscriber: AlarmEventSubscriber): () => void {
  const subscribers = getSubscribers();
  subscribers.add(subscriber);

  return () => {
    subscribers.delete(subscriber);
  };
}

export function publishAlarmEvent(event: AlarmRealtimeEvent): void {
  for (const subscriber of getSubscribers()) {
    subscriber(event);
  }
}

export function getAlarmEventSubscriberCount(): number {
  return getSubscribers().size;
}

export function resetAlarmEventsForTests(): void {
  getSubscribers().clear();
}
