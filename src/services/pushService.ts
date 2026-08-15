/// <reference lib="webworker" />

/**
 * Converte a chave VAPID base64url para Uint8Array
 */
function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding)
    .replace(/\-/g, '+')
    .replace(/_/g, '/');

  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

/**
 * Solicita permisso do SO e inscreve o usurio no Web Push
 */
export async function subscribeToWebPush(supabaseClient: any): Promise<{ success: boolean; error?: string }> {
  try {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      return { success: false, error: 'Web Push no suportado neste navegador.' };
    }

    // Pede permisso ao usurio
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      return { success: false, error: 'Permisso para notificaes foi negada.' };
    }

    const registration = await navigator.serviceWorker.ready;

    // Chave VAPID Pblica vinda do .env
    const publicVapidKey = import.meta.env.VITE_VAPID_PUBLIC_KEY;
    if (!publicVapidKey) {
      return { success: false, error: 'VAPID Public Key no configurada no frontend.' };
    }

    // Inscreve no servidor de push nativo (Google/Apple/Mozilla)
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicVapidKey)
    });

    const subJson = subscription.toJSON();

    // Envia a assinatura para a Edge Function do Supabase
    const { error: fnError } = await supabaseClient.functions.invoke('push-subscribe', {
      body: {
        action: 'subscribe',
        subscription: subJson,
        userAgent: navigator.userAgent
      }
    });

    if (fnError) throw fnError;

    return { success: true };
  } catch (err: any) {
    console.error('Erro ao inscrever no Web Push:', err);
    return { success: false, error: err.message || 'Erro desconhecido.' };
  }
}
