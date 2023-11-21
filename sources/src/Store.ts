export interface Store {
    setItem(key: string, value: string): Promise<void>;
    getItem(key: string): Promise<string>;
    removeItem(key: string): Promise<void>;
}

export class LocalStore implements Store {
    public async setItem(key: string, value: string): Promise<void> {
        if (value) {
            localStorage.setItem(key, value);
        } else {
            localStorage.removeItem(key);
        }
    }

    public async getItem(key: string): Promise<string> {
        const text: string | null = localStorage.getItem(key) ?? "";
        return text === "undefined" ? "" : text;
    }

    public async removeItem(key: string): Promise<void> {
        localStorage.removeItem(key);
    }
}

export class ChromeStore implements Store {
    public async setItem(key: string, value: string): Promise<void> {
        if (value) {
            await chrome.storage.local.set({ [key]: value });
        } else {
            await chrome.storage.local.remove([key]);
        }
    }

    public async getItem(key: string): Promise<string> {
        const result = await chrome.storage.local.get([key]);

        console.log(key, result[key]);

        return result[key];
    }

    public async removeItem(key: string): Promise<void> {
        chrome.storage.local.remove([key]);
    }
}
