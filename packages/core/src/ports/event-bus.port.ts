export interface DomainEvent<TType extends string = string, TPayload = unknown> {
  readonly type: TType;
  readonly occurredAt: string;
  readonly payload: TPayload;
}

/** Outbound integration events (webhooks, queues, metrics). */
export interface EventBusPort {
  publish(event: DomainEvent): Promise<void>;
}
