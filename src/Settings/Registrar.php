<?php

declare(strict_types=1);

namespace Avatar\AvatarIntegration\Settings;

class Registrar
{
    private const SETTINGS_SECTION_API = 'api';

    public const SETTING_API_KEY = 'avatar-api-key';
    public const SETTING_AVATAR_PROXY_URL = 'avatar-proxy-url';
    public const SETTING_AVATAR_API_URL = 'avatar-api-url';

    public function __construct(private FieldRenderer $fieldRenderer)
    {
    }

    public function register(): void
    {
        register_setting(MenuInjector::PAGE_ID, self::SETTING_API_KEY);
        register_setting(MenuInjector::PAGE_ID, self::SETTING_AVATAR_PROXY_URL);
        register_setting(MenuInjector::PAGE_ID, self::SETTING_AVATAR_API_URL);

        add_settings_section(
            self::SETTINGS_SECTION_API,
            'API',
            '__return_empty_string',
            MenuInjector::PAGE_ID
        );

        add_settings_field(
            self::SETTING_API_KEY,
            __('Iliana AI API Key', 'avatar-integration'),
            [$this->fieldRenderer, 'render'],
            MenuInjector::PAGE_ID,
            self::SETTINGS_SECTION_API,
            [
                'label_for' => self::SETTING_API_KEY,
                'id' => self::SETTING_API_KEY,
                'default' => '',
            ]
        );

        add_settings_field(
            self::SETTING_AVATAR_PROXY_URL,
            __('Iliana AI Proxy URL (ilianaaiAvatar)', 'avatar-integration'),
            [$this->fieldRenderer, 'render'],
            MenuInjector::PAGE_ID,
            self::SETTINGS_SECTION_API,
            [
                'label_for' => self::SETTING_AVATAR_PROXY_URL,
                'id' => self::SETTING_AVATAR_PROXY_URL,
                'default' => 'https://avatar.ilianaai.com',
            ]
        );

        add_settings_field(
            self::SETTING_AVATAR_API_URL,
            __('Iliana AI API Base URL', 'avatar-integration'),
            [$this->fieldRenderer, 'render'],
            MenuInjector::PAGE_ID,
            self::SETTINGS_SECTION_API,
            [
                'label_for' => self::SETTING_AVATAR_API_URL,
                'id' => self::SETTING_AVATAR_API_URL,
                'default' => 'https://app.ilianaai.com/api/v1',
            ]
        );
    }
}
