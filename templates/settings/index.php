<?php

declare(strict_types=1);

use Avatar\AvatarIntegration\Settings\MenuInjector;

defined('ABSPATH') or die();

?>

<div class="wrap">
    <h1> <?= esc_html__('Chatbot Settings', 'avatar-integration'); ?> </h1>

    <form action="options.php" method="post">
        <?php
        settings_fields(MenuInjector::PAGE_ID);
        do_settings_sections(MenuInjector::PAGE_ID);
        submit_button();
        ?>
    </form>
</div>
