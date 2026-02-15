<?php

/**
 * @var array $args
 */

[
    'id' => $id,
    'default' => $default,
] = $args;

if (! isset($id)) {
    return;
}

$value = get_option($id);
if (! $value) {
    $value = $default ? : '';
}

?>

<input
    type="text"
    class="regular-text"
    id="<?= esc_attr($id) ?>"
    name="<?= esc_attr($id) ?>"
    value="<?= esc_attr($value) ?>"
/>
