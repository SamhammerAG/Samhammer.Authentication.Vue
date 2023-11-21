import type { Store } from "./Store";
import { LocalStore } from "./Store";

class StoreProvider {
    public store: Store = new LocalStore();

    public setStore(newStore: Store): void {
        this.store = newStore;
    }
}

export default new StoreProvider();
