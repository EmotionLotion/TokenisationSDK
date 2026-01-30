
export class SecretsManagerClient {
    constructor() { }
    send() {
        return Promise.reject(new Error("AWS Secrets Manager is not available in the browser environment."));
    }
}
