<?php

declare(strict_types=1);

namespace Avatar\AvatarIntegration\Settings;

class MenuInjector
{
    public const PAGE_ID = 'chatbot-settings';

    public function __construct(private PageRenderer $renderer)
    {
    }

    public function inject(): void
    {
        add_options_page(
            __('Chatbot settings', 'avatar-integration'),
            __('Chatbot settings', 'avatar-integration'),
            'manage_options',
            self::PAGE_ID,
            [$this->renderer, 'render']
        );
    }
}
