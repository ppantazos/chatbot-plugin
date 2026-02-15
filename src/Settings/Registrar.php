<?php

declare(strict_types=1);

namespace Avatar\AvatarIntegration\Settings;

class Registrar
{
    private const SETTINGS_SECTION_API = 'api';

    public const SETTING_API_KEY = 'avatar-api-key';

    public function __construct(private FieldRenderer $fieldRenderer)
    {
    }

    public function register(): void
    {
        register_setting(MenuInjector::PAGE_ID, self::SETTING_API_KEY);

        add_settings_section(
            self::SETTINGS_SECTION_API,
            'API',
            '__return_empty_string',
            MenuInjector::PAGE_ID
        );

        add_settings_field(
            self::SETTING_API_KEY,
            __('API Key', 'avatar-integration'),
            [$this->fieldRenderer, 'render'],
            MenuInjector::PAGE_ID,
            self::SETTINGS_SECTION_API,
            [
                'label_for' => self::SETTING_API_KEY,
                'id' => self::SETTING_API_KEY,
                'default' => '',
            ]
        );
    }
}
