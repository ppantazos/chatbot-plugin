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
        if (! dataContainer) {
            return;
        }

        this.config = JSON.parse(dataContainer.textContent);
    }

    fetch() {
        return this.config;
    }

    getOpenAIApiKey() {
        return this.config?.openaiApiKey ?? this.openaiApiKey ?? '';
    }
}
