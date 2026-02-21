<?php

/**
 * @var array $args
 */

$id = $args['id'] ?? null;
$default = $args['default'] ?? '';
$inputType = $args['type'] ?? 'text';
$description = $args['description'] ?? null;

if (! isset($id)) {
    return;
}

$value = get_option($id);
if (! $value) {
    $value = $default ?: '';
}

?>

<input
    type="<?= esc_attr($inputType) ?>"
    class="regular-text"
    id="<?= esc_attr($id) ?>"
    name="<?= esc_attr($id) ?>"
    value="<?= esc_attr($value) ?>"
    autocomplete="off"
/>
<?php if ($description): ?>
    <p class="description"><?= esc_html($description) ?></p>
<?php endif; ?>
