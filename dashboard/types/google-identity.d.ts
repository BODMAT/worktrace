interface GoogleCredentialResponse {
  credential: string;
  select_by:  string;
}

interface GoogleIdConfig {
  client_id: string;
  callback:  (response: GoogleCredentialResponse) => void;
  auto_select?:          boolean;
  cancel_on_tap_outside?: boolean;
}

interface GoogleButtonConfig {
  type?:  "standard" | "icon";
  theme?: "outline" | "filled_blue" | "filled_black";
  size?:  "large" | "medium" | "small";
  text?:  "signin_with" | "signup_with" | "continue_with" | "signin";
  shape?: "rectangular" | "pill" | "circle" | "square";
  width?: number;
}

interface GoogleAccountsId {
  initialize:    (config: GoogleIdConfig) => void;
  renderButton:  (parent: HTMLElement, config: GoogleButtonConfig) => void;
  prompt:        () => void;
  cancel:        () => void;
  disableAutoSelect: () => void;
}

interface Window {
  google?: {
    accounts: {
      id: GoogleAccountsId;
    };
  };
}
