export class EntityWithComputedFields<T> {
  entity: T;
  computed: Record<string, any>;

  constructor(entity: T) {
    this.entity = entity;
    this.computed = {};
  }
}
