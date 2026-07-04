<template>
  <q-item
    v-for="option in themeOptions"
    :key="option.value"
    clickable
    v-close-popup
    v-ripple
    :active="theme.preference === option.value"
    active-class="theme-menu-active"
    @click="selectTheme(option.value)"
  >
    <q-item-section avatar>
      <q-icon :name="option.icon" />
    </q-item-section>
    <q-item-section>
      <q-item-label>{{ option.label }}</q-item-label>
      <q-item-label caption>{{ option.caption }}</q-item-label>
    </q-item-section>
  </q-item>
</template>

<script setup lang="ts">
import { useThemeStore, type ThemePreference } from '../../stores/theme';

const emit = defineEmits<{
  select: [];
}>();

const theme = useThemeStore();

const themeOptions: Array<{
  value: ThemePreference;
  label: string;
  caption: string;
  icon: string;
}> = [
  {
    value: 'system',
    label: 'System',
    caption: 'Use browser preference',
    icon: 'contrast'
  },
  {
    value: 'light',
    label: 'Light',
    caption: 'Always use light mode',
    icon: 'light_mode'
  },
  {
    value: 'dark',
    label: 'Dark',
    caption: 'Always use dark mode',
    icon: 'dark_mode'
  }
];

function selectTheme(preference: ThemePreference) {
  theme.setPreference(preference);
  emit('select');
}
</script>
