import { ipcRenderer } from "electron";

import {
  detectLoginFormFields,
  type LoginFormInputDescriptor,
  type LoginInputType
} from "../core/login-form-detection";
import {
  type SiteCredentialAutofillResponse,
  type SiteCredentialCapturePayload
} from "../core/site-credential-messages";
import { getOriginFromUrl } from "../core/site-credential-origin";
import { IPC_CHANNELS } from "../core/shell-config";

interface LoginFormElements {
  readonly password: HTMLInputElement;
  readonly username: HTMLInputElement;
}

let lastCapturedKey = "";
let scheduledAutofill: number | null = null;

const readLoginFormElements = (): LoginFormElements | null => {
  const inputs = Array.from(document.querySelectorAll("input"));
  const descriptors = inputs.map((input, index) => toDescriptor(input, index));
  const match = detectLoginFormFields(descriptors);

  if (match === null) {
    return null;
  }

  const username = inputs[match.usernameIndex];
  const password = inputs[match.passwordIndex];

  return username === undefined || password === undefined
    ? null
    : {
        password,
        username
      };
};

const requestAutofill = async (): Promise<void> => {
  const origin = getOriginFromUrl(window.location.href);
  const fields = readLoginFormElements();

  if (origin === null || fields === null) {
    return;
  }

  try {
    const rawResponse: unknown = await ipcRenderer.invoke(IPC_CHANNELS.siteCredentialAutofillRequest);
    const response = parseAutofillResponse(rawResponse);

    if (!response.ok || response.credential === null) {
      return;
    }

    if (fields.username.value.length === 0) {
      setInputValue(fields.username, response.credential.username);
    }

    if (fields.password.value.length === 0) {
      setInputValue(fields.password, response.credential.password);
    }
  } catch (error: unknown) {
    if (error instanceof Error) {
      return;
    }

    throw error;
  }
};

const captureCurrentCredential = (): void => {
  const origin = getOriginFromUrl(window.location.href);
  const fields = readLoginFormElements();

  if (origin === null || fields === null) {
    return;
  }

  const username = fields.username.value.trim();
  const password = fields.password.value;

  if (username.length === 0 || password.length === 0) {
    return;
  }

  const captureKey = `${origin}\n${username}\n${password}`;

  if (captureKey === lastCapturedKey) {
    return;
  }

  lastCapturedKey = captureKey;
  const payload = {
    password,
    username
  } satisfies SiteCredentialCapturePayload;

  ipcRenderer.send(IPC_CHANNELS.siteCredentialCaptured, payload);
};

const scheduleAutofill = (): void => {
  if (scheduledAutofill !== null) {
    window.clearTimeout(scheduledAutofill);
  }

  scheduledAutofill = window.setTimeout(() => {
    scheduledAutofill = null;
    void requestAutofill();
  }, 50);
};

const installMutationAutofill = (): void => {
  const root = document.documentElement;
  const observer = new MutationObserver(scheduleAutofill);

  observer.observe(root, {
    childList: true,
    subtree: true
  });
  window.setTimeout(() => {
    observer.disconnect();
  }, 5_000);
};

const installCredentialCapture = (): void => {
  document.addEventListener(
    "submit",
    () => {
      captureCurrentCredential();
    },
    true
  );
  document.addEventListener(
    "click",
    (event) => {
      if (isSubmitActivation(event.target)) {
        captureCurrentCredential();
      }
    },
    true
  );
};

const isSubmitActivation = (target: EventTarget | null): boolean => {
  if (!(target instanceof Element)) {
    return false;
  }

  const activator = target.closest("button,input");

  if (activator instanceof HTMLButtonElement) {
    return activator.type === "submit";
  }

  return activator instanceof HTMLInputElement && (activator.type === "submit" || activator.type === "image");
};

const toDescriptor = (input: HTMLInputElement, index: number): LoginFormInputDescriptor => ({
  autocomplete: input.autocomplete,
  formId: getFormId(input),
  index,
  type: normalizeInputType(input.type)
});

const getFormId = (input: HTMLInputElement): string | null => {
  if (input.form === null) {
    return "document";
  }

  const forms = Array.from(document.forms);
  const formIndex = forms.indexOf(input.form);

  return formIndex === -1 ? null : `form:${String(formIndex)}`;
};

const normalizeInputType = (type: string): LoginInputType => {
  switch (type.toLowerCase()) {
    case "email":
      return "email";
    case "password":
      return "password";
    case "search":
      return "search";
    case "tel":
      return "tel";
    case "text":
      return "text";
    case "url":
      return "url";
    default:
      return "unknown";
  }
};

const setInputValue = (input: HTMLInputElement, value: string): void => {
  input.value = value;
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
};

const parseAutofillResponse = (value: unknown): SiteCredentialAutofillResponse => {
  if (!isRecord(value) || value["ok"] !== true) {
    return { ok: false };
  }

  const credential = value["credential"];

  if (credential === null) {
    return {
      credential: null,
      ok: true
    };
  }

  if (!isRecord(credential)) {
    return { ok: false };
  }

  const username = credential["username"];
  const password = credential["password"];

  return typeof username === "string" && typeof password === "string"
    ? {
        credential: {
          password,
          username
        },
        ok: true
      }
    : { ok: false };
};

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

installCredentialCapture();

if (document.readyState === "loading") {
  document.addEventListener(
    "DOMContentLoaded",
    () => {
      scheduleAutofill();
      installMutationAutofill();
    },
    { once: true }
  );
} else {
  scheduleAutofill();
  installMutationAutofill();
}
