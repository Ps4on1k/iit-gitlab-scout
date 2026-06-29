import { theme } from "antd";

const FONT = "'Manrope', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";

export const darkThemeConfig = {
  algorithm: theme.darkAlgorithm,
  token: {
    colorPrimary: "#3A8DFF",
    colorBgContainer: "#1A2332",
    colorBgLayout: "#111827",
    colorBgElevated: "#1F2D3D",
    colorBgSpotlight: "#243040",
    colorBorder: "#2A3A4A",
    colorBorderSecondary: "#1F2D3D",
    colorText: "#E8ECF1",
    colorTextSecondary: "#AEB7C4",
    colorTextTertiary: "#8A94A6",
    borderRadius: 2,
    fontFamily: FONT,
  },
  components: {
    Card: {
      colorBgContainer: "#1A2332",
      colorBorderSecondary: "#2A3A4A",
    },
    Table: {
      colorBgContainer: "#1A2332",
      headerBg: "#1F2D3D",
      headerColor: "#AEB7C4",
      colorBgBody: "#1A2332",
      colorBorderSecondary: "#2A3A4A",
      rowHoverBg: "#243040",
    },
    Menu: {
      darkItemBg: "#111827",
      darkSubMenuItemBg: "#0D1320",
      darkItemSelectedBg: "rgba(58,141,255,0.12)",
      darkItemSelectedColor: "#fff",
      darkItemColor: "rgba(255,255,255,0.5)",
      darkItemHoverColor: "#fff",
    },
    Select: {
      colorBgContainer: "#1F2D3D",
      colorBgElevated: "#243040",
      optionSelectedBg: "rgba(58,141,255,0.12)",
    },
    DatePicker: {
      colorBgContainer: "#1F2D3D",
      colorBgElevated: "#243040",
    },
    Input: {
      colorBgContainer: "#1F2D3D",
    },
    Tag: {
      defaultBg: "#1F2D3D",
    },
    Statistic: {
      colorTextDescription: "#AEB7C4",
    },
    Spin: {
      colorPrimary: "#42D9C8",
    },
    Empty: {
      colorTextDisabled: "#8A94A6",
    },
  },
};

export const lightThemeConfig = {
  algorithm: theme.defaultAlgorithm,
  token: {
    colorPrimary: "#3A8DFF",
    borderRadius: 2,
    fontFamily: FONT,
    colorBgContainer: "#FFFFFF",
    colorBgLayout: "#F5F7FA",
    colorBgElevated: "#FFFFFF",
    colorBorder: "#D8DCE3",
    colorBorderSecondary: "#EEF1F4",
    colorText: "#111315",
    colorTextSecondary: "#4A5568",
    colorTextTertiary: "#8A94A6",
  },
  components: {
    Card: {
      colorBgContainer: "#FFFFFF",
      colorBorderSecondary: "#EEF1F4",
    },
    Table: {
      colorBgContainer: "#FFFFFF",
      headerBg: "#F0F2F5",
      headerColor: "#4A5568",
      colorBorderSecondary: "#EEF1F4",
      rowHoverBg: "#F8F9FA",
    },
    Menu: {
      darkItemBg: "#111315",
      darkSubMenuItemBg: "#0A0C0E",
      darkItemSelectedBg: "rgba(58,141,255,0.1)",
      darkItemSelectedColor: "#fff",
      darkItemColor: "rgba(255,255,255,0.5)",
      darkItemHoverColor: "#fff",
    },
    Spin: {
      colorPrimary: "#3A8DFF",
    },
  },
};
