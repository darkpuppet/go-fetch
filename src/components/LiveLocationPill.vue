<template>
  <div v-if="liveTracking.isSharing" class="live-location-pill" role="status">
    <span class="live-location-pill__dot" aria-hidden="true" />
    <span class="live-location-pill__label gt-xs">Live sharing</span>
    <span class="live-location-pill__label xs">Live</span>
    <q-btn
      flat
      dense
      round
      size="sm"
      class="live-location-pill__stop"
      icon="close"
      aria-label="Stop live location sharing"
      :loading="liveTracking.isUpdating"
      @click="stopSharing"
    />
  </div>
</template>

<script setup lang="ts">
import { Notify } from 'quasar';

import { useTruckLiveTrackingStore } from '../stores/truckLiveTracking';

const liveTracking = useTruckLiveTrackingStore();

async function stopSharing() {
  try {
    await liveTracking.disableTracking();
    Notify.create({
      type: 'positive',
      message: 'Live location sharing is off.'
    });
  } catch (error) {
    Notify.create({
      type: 'negative',
      message: error instanceof Error ? error.message : 'Unable to stop live location sharing.'
    });
  }
}
</script>

<style scoped>
.live-location-pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 4px 4px 10px;
  border-radius: 999px;
  background: #15803d;
  color: #ffffff;
  flex-shrink: 0;
  max-width: min(100%, 220px);
}

.live-location-pill__dot {
  width: 8px;
  height: 8px;
  border-radius: 999px;
  background: #ffffff;
  flex-shrink: 0;
  animation: live-location-pulse 1.6s ease-in-out infinite;
}

.live-location-pill__label {
  font-size: 0.76rem;
  font-weight: 700;
  letter-spacing: 0.02em;
  white-space: nowrap;
}

.live-location-pill__stop {
  color: #ffffff;
  min-width: 24px;
  min-height: 24px;
}

@keyframes live-location-pulse {
  0%,
  100% {
    opacity: 1;
    transform: scale(1);
  }

  50% {
    opacity: 0.55;
    transform: scale(0.82);
  }
}
</style>
