import _ from 'lodash';

class LocalStorageUtils {
    public setItem(key: string, value: string): void {
        if (value) {
            localStorage.setItem(key, value);
        } else {
            localStorage.removeItem(key);
        }
    }

    public setItems(key: string, values: string[]): void {
        this.setItem(key, _.join(values, ','));
    }

    public getItem(key: string): string {
        const text: string = localStorage.getItem(key);
        return typeof text === 'undefined' ? null : text;
    }

    public getItems(key: string): string[] {
        const text: string = this.getItem(key);
        return text !== null ? _.split(text, ',') : null;
    }

    public removeItem(key: string): void {
        localStorage.removeItem(key);
    }
}

export default new LocalStorageUtils();
