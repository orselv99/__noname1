
export class AsyncLocalStorage<T> {
  private store: T | undefined;

  constructor() {
    this.store = undefined;
  }

  disable() {
    this.store = undefined;
  }

  getStore() {
    return this.store;
  }

  run<R>(store: T, callback: (...args: any[]) => R, ...args: any[]): R {
    this.store = store;
    try {
      return callback(...args);
    } finally {
      this.store = undefined;
    }
  }

  exit<R>(callback: (...args: any[]) => R, ...args: any[]): R {
    return callback(...args);
  }

  enterWith(store: T): void {
    this.store = store;
  }
}
