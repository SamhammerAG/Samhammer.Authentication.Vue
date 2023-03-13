import _ from "lodash";

class LocalStorageUtils {
    public setItem(key: string, value: string): void {
        if (value) {
            localStorage.setItem(key, value);
        } else {
            localStorage.removeItem(key);
        }
    }

    public setItems(key: string, values: string[]): void {
        this.setItem(key, _.join(values, ","));
    }

    public getItem(key: string): string {
        const text: string | null = localStorage.getItem(key) ?? "";
        return text === "undefined" ? "" : text;
    }

    public removeItem(key: string): void {
        localStorage.removeItem(key);
    }
}

export default new LocalStorageUtils();
