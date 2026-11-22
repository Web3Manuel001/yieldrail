import type { DomainEvent, EventBusPort } from '@yieldrail/core';

/** In-memory event bus for the demo; tests can inspect published events. */
export class InMemoryEventBus implements EventBusPort {
  readonly events: DomainEvent[] = [];

  async publish(event: DomainEvent): Promise<void> {
    this.events.push(event);
  }
}
