const FIREBASE_CONFIG = {
  apiKey: "AIzaSyCiiIWhj8Hfh8vauOqc_KQZTwiIFiRQOow",
  authDomain: "eyr-vehicle-import.firebaseapp.com",
  projectId: "eyr-vehicle-import",
  storageBucket: "eyr-vehicle-import.firebasestorage.app",
  messagingSenderId: "935877997082",
  appId: "1:935877997082:web:e15c7d108fa27189a7d7a3",
};

export const FIREBASE_VAPID_KEY =
  "BL8aUxIu4whF3_t37CXHfiUD1ZaLtTVm4edGgom-8YxrCfBFYFr2Xp5skxoZC9xen0Fw9dLGeUickxL_MGN9w6w";

const FIREBASE_VERSION = "10.14.1";

let firebasePromise = null;
let foregroundUnsubscribe = null;

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${src}"]`);

    if (existing) {
      if (existing.dataset.loaded === "true") return resolve();

      existing.addEventListener("load", resolve, { once: true });
      existing.addEventListener("error", reject, { once: true });

      return;
    }

    const script = document.createElement("script");

    script.src = src;
    script.async = false;

    script.onload = () => {
      script.dataset.loaded = "true";
      resolve();
    };

    script.onerror = reject;

    document.head.appendChild(script);
  });
}

async function getFirebase() {
  if (typeof window === "undefined") {
    throw new Error(
      "Firebase Messaging solo está disponible en el navegador."
    );
  }

  if (window.firebase?.messaging) {
    return window.firebase;
  }

  if (!firebasePromise) {
    firebasePromise = (async () => {
      await loadScript(
        `https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}/firebase-app-compat.js`
      );

      await loadScript(
        `https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}/firebase-messaging-compat.js`
      );

      if (!window.firebase?.apps?.length) {
        window.firebase.initializeApp(FIREBASE_CONFIG);
      }

      return window.firebase;
    })();
  }

  return firebasePromise;
}

function detectPlatform() {
  const ua = navigator.userAgent || "";

  if (/iPhone|iPad|iPod/i.test(ua)) return "IOS";
  if (/Android/i.test(ua)) return "ANDROID";
  if (/Windows/i.test(ua)) return "WINDOWS";
  if (/Macintosh|Mac OS X/i.test(ua)) return "MACOS";

  return "WEB";
}

function deviceName() {
  const ua = navigator.userAgent || "";

  if (/Edg\//i.test(ua)) return "Microsoft Edge";
  if (/Chrome\//i.test(ua)) return "Google Chrome";
  if (/Firefox\//i.test(ua)) return "Mozilla Firefox";
  if (/Safari\//i.test(ua)) return "Safari";

  return detectPlatform();
}

export async function registerFirebaseDevice({ supabase }) {
  if (
    !("serviceWorker" in navigator) ||
    !("Notification" in window)
  ) {
    throw new Error(
      "Este navegador no admite notificaciones push."
    );
  }

  const permission = await Notification.requestPermission();

  if (permission !== "granted") {
    return {
      permission,
      token: null,
    };
  }

  const firebase = await getFirebase();

  const registration =
    await navigator.serviceWorker.register(
      "/firebase-messaging-sw.js",
      {
        scope: "/",
      }
    );

  await navigator.serviceWorker.ready;

  const messaging = firebase.messaging();

  const token = await messaging.getToken({
    vapidKey: FIREBASE_VAPID_KEY,
    serviceWorkerRegistration: registration,
  });

  if (!token) {
    throw new Error(
      "Firebase no devolvió un token para este dispositivo."
    );
  }

  const { data, error } = await supabase.rpc(
    "register_notification_device_v3970",
    {
      p_fcm_token: token,
      p_platform: detectPlatform(),
      p_device_name: deviceName(),
      p_user_agent: navigator.userAgent || null,
    }
  );

  if (error) {
    throw error;
  }

  return {
    permission,
    token,
    device: Array.isArray(data) ? data[0] : data,
  };
}

export async function listenForegroundMessages(onMessage) {
  const firebase = await getFirebase();

  const messaging = firebase.messaging();

  if (foregroundUnsubscribe) {
    foregroundUnsubscribe();
  }

  foregroundUnsubscribe = messaging.onMessage(
    async (payload) => {
      try {
        await onMessage?.(payload);

        const title =
          payload?.data?.title ||
          payload?.notification?.title;

        const body =
          payload?.data?.body ||
          payload?.notification?.body;

        const url =
          payload?.data?.url || "/app";

        if (
          Notification.permission === "granted" &&
          title
        ) {
          const registration =
            await navigator.serviceWorker.ready;

          await registration.showNotification(title, {
            body:
              body ||
              "Tenés una nueva notificación.",
            icon: "/branding/icon-192.png",
            badge: "/branding/icon-192.png",
            tag:
              payload?.data?.tag ||
              "eyr-fcm",
            data: {
              url,
            },
          });
        }
      } catch (error) {
        console.error(
          "FCM FOREGROUND MESSAGE ERROR:",
          error
        );
      }
    }
  );

  return foregroundUnsubscribe;
}

export async function getFirebasePushStatus({
  supabase,
} = {}) {
  if (
    !("Notification" in window) ||
    !("serviceWorker" in navigator)
  ) {
    return {
      state: "UNSUPPORTED",
      permission: "unsupported",
      registered: false,
    };
  }

  const permission = Notification.permission;

  /*
   * V39.7.3.4
   *
   * Un dispositivo que todavía no ha autorizado
   * notificaciones NO puede considerarse registrado,
   * aunque la misma cuenta tenga otros dispositivos
   * activos en Supabase.
   */
  if (permission !== "granted") {
    return {
      state: permission.toUpperCase(),
      permission,
      registered: false,
      devices: [],
    };
  }

  if (!supabase) {
    return {
      state: "PERMISSION_ONLY",
      permission,
      registered: false,
    };
  }

  try {
    const { data, error } = await supabase.rpc(
      "my_notification_devices_v3970"
    );

    if (error) {
      throw error;
    }

    const devices =
      Array.isArray(data) ? data : [];

    /*
     * Con permiso granted sabemos que ESTE navegador
     * fue autorizado.
     *
     * Por ahora conservamos la validación de dispositivo
     * registrado en la base de datos, pero ya no permitimos
     * que una PC registrada haga aparecer como activo un
     * celular que nunca otorgó permiso.
     */
    const currentPlatform = detectPlatform();
    const currentDeviceName = deviceName();
    const currentUserAgent =
      navigator.userAgent || "";

    const registered = devices.some((row) => {
      if (row?.active !== true) {
        return false;
      }

      const samePlatform =
        !row?.platform ||
        row.platform === currentPlatform;

      const sameDeviceName =
        !row?.device_name ||
        row.device_name === currentDeviceName;

      const sameUserAgent =
        !row?.user_agent ||
        row.user_agent === currentUserAgent;

      return (
        samePlatform &&
        sameDeviceName &&
        sameUserAgent
      );
    });

    return {
      state: registered
        ? "REGISTERED"
        : "PERMISSION_ONLY",
      permission,
      registered,
      devices,
    };
  } catch (error) {
    console.warn(
      "FCM STATUS CHECK ERROR:",
      error?.message
    );

    return {
      state: "PERMISSION_ONLY",
      permission,
      registered: false,
      error:
        error?.message ||
        "No fue posible validar el dispositivo.",
    };
  }
}