<template>
  <!-- Toasts sit above the status bar (two rows of it on a phone), so they never cover its items,
       and under the menus and dialogs (z-index 50), so a menu opened near one is never behind it. -->
  <UApp :toaster="{ ui: { viewport: 'bottom-16 z-40' } }">
    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>
  </UApp>
</template>
