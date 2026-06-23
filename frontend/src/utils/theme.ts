import { theme } from "antd";

export const darkThemeConfig = {
  algorithm: theme.darkAlgorithm,
  token: {
    colorPrimary: "#667eea",
    colorBgContainer: "#1e1e2e",
    colorBgLayout: "#11111b",
    colorBgElevated: "#252536",
    colorBgSpotlight: "#2a2a3c",
    colorBorder: "#313147",
    colorBorderSecondary: "#2a2a3c",
    colorText: "#e0e0e8",
    colorTextSecondary: "#a0a0b4",
    colorTextTertiary: "#6e6e82",
    borderRadius: 8,
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
  },
  components: {
    Card: {
      colorBgContainer: "#1e1e2e",
      colorBorderSecondary: "#313147",
    },
    Table: {
      colorBgContainer: "#1e1e2e",
      headerBg: "#252536",
      headerColor: "#e0e0e8",
      colorBgBody: "#1e1e2e",
      colorBorderSecondary: "#313147",
      rowHoverBg: "#2a2a3c",
    },
    Menu: {
      darkItemBg: "#11111b",
      darkSubMenuItemBg: "#0d0d17",
      darkItemSelectedBg: "rgba(102,126,234,0.2)",
      darkItemSelectedColor: "#fff",
      darkItemColor: "rgba(255,255,255,0.65)",
      darkItemHoverColor: "#fff",
    },
    Select: {
      colorBgContainer: "#252536",
      colorBgElevated: "#2a2a3c",
      optionSelectedBg: "rgba(102,126,234,0.2)",
    },
    DatePicker: {
      colorBgContainer: "#252536",
      colorBgElevated: "#2a2a3c",
    },
    Input: {
      colorBgContainer: "#252536",
    },
    Tag: {
      defaultBg: "#252536",
    },
    Statistic: {
      colorTextDescription: "#a0a0b4",
    },
    Spin: {
      colorPrimary: "#667eea",
    },
    Empty: {
      colorTextDisabled: "#6e6e82",
    },
  },
};

export const lightThemeConfig = {
  algorithm: theme.defaultAlgorithm,
  token: {
    colorPrimary: "#667eea",
    borderRadius: 8,
  },
};
