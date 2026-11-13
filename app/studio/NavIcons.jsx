export const NAV_ICONS = [
  { id: "home", label: "Home" },
  { id: "shop", label: "Shop" },
  { id: "bag", label: "Bag" },
  { id: "account", label: "Account" },
];

export function NavTabIcon({ name }) {
  if (name === "shop") return <ShopIcon />;
  if (name === "bag") return <BagIcon />;
  if (name === "account") return <AccountIcon />;
  return <HomeIcon />;
}

function HomeIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <path
        d="M3.5 9.2 10 3.5l6.5 5.7V16a1 1 0 0 1-1 1h-3.4v-4.2H7.9V17H4.5a1 1 0 0 1-1-1V9.2Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ShopIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <path
        d="M3.2 8.2 4.8 4.2h10.4l1.6 4c0 1.2-1 2.1-2.2 2.1S12.4 9.4 12.4 8.2c0 1.2-1 2.1-2.2 2.1S8 9.4 8 8.2c0 1.2-1 2.1-2.2 2.1S3.2 9.4 3.2 8.2Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path
        d="M4.4 10.2V16h11.2v-5.8"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path
        d="M8.4 16v-3.4h3.2V16"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function BagIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <path
        d="M4 6.2h12l-.8 9.2a1.4 1.4 0 0 1-1.4 1.2H6.2a1.4 1.4 0 0 1-1.4-1.2L4 6.2Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <path
        d="M7 6.2V4.8a3 3 0 0 1 6 0v1.4"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function AccountIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <circle cx="10" cy="7" r="3.1" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <path
        d="M4.2 16.2a5.8 5.8 0 0 1 11.6 0"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}
