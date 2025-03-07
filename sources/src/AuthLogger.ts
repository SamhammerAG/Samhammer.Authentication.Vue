class AuthLogger {
    private prefix = "[SAGAUTH]";

    public debug(...messages: unknown[]) {
        console.debug(this.prefix, ...messages);
    }

    public log(...messages: unknown[]) {
        console.log(this.prefix, ...messages);
    }

    public warn(...messages: unknown[]) {
        console.warn(this.prefix, ...messages);
    }

    public error(...messages: unknown[]) {
        console.error(this.prefix, ...messages);
    }
}

export default new AuthLogger();
