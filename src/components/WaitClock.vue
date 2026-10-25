<template>
  <div class="wait-clock" :class="{ 'wait-clock-centered': centered }" :aria-label="ariaLabel">
    <span v-if="parts.ready" class="wait-clock-ready">Any moment</span>
    <template v-else>
      <span v-if="parts.hours != null" class="wait-clock-part">
        <span class="wait-clock-value">{{ parts.hours }}</span>
        <span class="wait-clock-unit">hr</span>
      </span>
      <span class="wait-clock-part">
        <span class="wait-clock-value">{{ parts.minutes }}</span>
        <span class="wait-clock-unit">m</span>
      </span>
      <span class="wait-clock-part">
        <span class="wait-clock-value">{{ parts.seconds }}</span>
        <span class="wait-clock-unit">s</span>
      </span>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';

import { waitClockParts } from '../utils/waitTime';

const props = withDefaults(
  defineProps<{
    remainingMillis: number;
    label: string;
    centered?: boolean;
  }>(),
  { centered: false }
);

const parts = computed(() => waitClockParts(props.remainingMillis));
const ariaLabel = computed(() => `${props.label} ${parts.value.label}`);
</script>

<style scoped>
.wait-clock {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 0.15rem 0.7rem;
  font-variant-numeric: tabular-nums;
  line-height: 1;
}

.wait-clock-centered {
  justify-content: center;
}

.wait-clock-part {
  display: inline-flex;
  align-items: baseline;
  gap: 0.28rem;
}

.wait-clock-value {
  font-size: 2.5rem;
  font-weight: 800;
  letter-spacing: 0.02em;
}

.wait-clock-unit {
  font-size: 0.85rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  opacity: 0.72;
}

.wait-clock-ready {
  font-size: 1.75rem;
  font-weight: 800;
}
</style>
