export class Config
{
    config = {};
    handler = '';
    openaiApiKey = '';

    constructor(handler) {
        this.handler = handler;
        this.init();
    }

    init() {
        const dataContainer = document.querySelector(`#wp-script-module-data-${this.handler}`);
        if (!dataContainer) {
            return;
        }
        try {
            this.config = JSON.parse(dataContainer.textContent);
        } catch (e) {
            console.warn('[Config] Failed to parse module data:', e?.message || e);
        }
    }

    fetch() {
        return this.config;
    }

    getOpenAIApiKey() {
        return this.openaiApiKey;
    }
}
