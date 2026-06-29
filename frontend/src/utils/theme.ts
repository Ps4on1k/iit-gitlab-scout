import { theme } from "antd";

const FONT = "'Manrope', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";

const DARK_BG = "#1A2332";
const DARK_BG_ELEVATED = "#1F2D3D";
const DARK_BORDER = "#2A3A4A";

export const darkThemeConfig = {
  algorithm: theme.darkAlgorithm,
  cssVar: {},
  token: {
    colorPrimary: "#3A8DFF",
    colorBgContainer: DARK_BG,
    colorBgLayout: "#111827",
    colorBgElevated: DARK_BG_ELEVATED,
    colorBgSpotlight: "#243040",
    colorBorder: DARK_BORDER,
    colorBorderSecondary: DARK_BG_ELEVATED,
    colorText: "#E8ECF1",
    colorTextSecondary: "#AEB7C4",
    colorTextTertiary: "#8A94A6",
    borderRadius: 2,
    fontFamily: FONT,
  },
  components: {
    Card: { colorBgContainer: DARK_BG, colorBorderSecondary: DARK_BORDER },
    Table: { colorBgContainer: DARK_BG, headerBg: DARK_BG_ELEVATED, headerColor: "#AEB7C4", colorBgBody: DARK_BG, colorBorderSecondary: DARK_BORDER, rowHoverBg: "#243040" },
    Menu: { darkItemBg: "#111827", darkSubMenuItemBg: "#0D1320", darkItemSelectedBg: "rgba(58,141,255,0.12)", darkItemSelectedColor: "#fff", darkItemColor: "rgba(255,255,255,0.5)", darkItemHoverColor: "#fff" },
    Select: { colorBgContainer: DARK_BG_ELEVATED, colorBgElevated: "#243040", optionSelectedBg: "rgba(58,141,255,0.12)" },
    DatePicker: { colorBgContainer: DARK_BG_ELEVATED, colorBgElevated: "#243040" },
    Input: { colorBgContainer: DARK_BG_ELEVATED },
    Modal: { contentBg: DARK_BG, headerBg: DARK_BG, footerBg: DARK_BG },
    Dropdown: { colorBgElevated: DARK_BG_ELEVATED },
    Popover: { colorBgElevated: DARK_BG_ELEVATED },
    Tooltip: { colorBgSpotlight: "#111315" },
    Popconfirm: { colorBgElevated: DARK_BG_ELEVATED },
    Drawer: { colorBgElevated: DARK_BG },
    Collapse: { headerBg: DARK_BG, contentBg: DARK_BG },
    Tag: { defaultBg: DARK_BG_ELEVATED },
    Statistic: { colorTextDescription: "#AEB7C4" },
    Spin: { colorPrimary: "#42D9C8" },
    Empty: { colorTextDisabled: "#8A94A6" },
    Alert: { colorInfoBg: "rgba(58,141,255,0.08)", colorSuccessBg: "rgba(33,181,115,0.08)", colorWarningBg: "rgba(255,176,32,0.08)", colorErrorBg: "rgba(229,72,77,0.08)" },
    Message: { contentBg: DARK_BG_ELEVATED },
    Notification: { colorBgElevated: DARK_BG_ELEVATED },
    Tabs: { cardBg: DARK_BG },
    Pagination: { colorBgContainer: DARK_BG_ELEVATED },
    Breadcrumb: { colorBgContainer: DARK_BG },
    Divider: { colorSplit: DARK_BORDER },
    Descriptions: { colorBgContainer: DARK_BG },
  },
};

const LIGHT_BG = "#FFFFFF";

export const lightThemeConfig = {
  algorithm: theme.defaultAlgorithm,
  cssVar: {},
  token: {
    colorPrimary: "#3A8DFF",
    borderRadius: 2,
    fontFamily: FONT,
    colorBgContainer: LIGHT_BG,
    colorBgLayout: "#F5F7FA",
    colorBgElevated: LIGHT_BG,
    colorBorder: "#D8DCE3",
    colorBorderSecondary: "#EEF1F4",
    colorText: "#111315",
    colorTextSecondary: "#4A5568",
    colorTextTertiary: "#8A94A6",
  },
  components: {
    Card: { colorBgContainer: LIGHT_BG, colorBorderSecondary: "#EEF1F4" },
    Table: { colorBgContainer: LIGHT_BG, headerBg: "#F0F2F5", headerColor: "#4A5568", colorBorderSecondary: "#EEF1F4", rowHoverBg: "#F8F9FA" },
    Menu: { darkItemBg: "#111315", darkSubMenuItemBg: "#0A0C0E", darkItemSelectedBg: "rgba(58,141,255,0.1)", darkItemSelectedColor: "#fff", darkItemColor: "rgba(255,255,255,0.5)", darkItemHoverColor: "#fff" },
    Modal: { contentBg: LIGHT_BG, headerBg: LIGHT_BG, footerBg: LIGHT_BG },
    Dropdown: { colorBgElevated: LIGHT_BG },
    Popover: { colorBgElevated: LIGHT_BG },
    Popconfirm: { colorBgElevated: LIGHT_BG },
    Drawer: { colorBgElevated: LIGHT_BG },
    Collapse: { headerBg: LIGHT_BG, contentBg: LIGHT_BG },
    Tag: { defaultBg: "#EEF1F4" },
    Spin: { colorPrimary: "#3A8DFF" },
    Alert: { colorInfoBg: "rgba(58,141,255,0.06)", colorSuccessBg: "rgba(33,181,115,0.06)", colorWarningBg: "rgba(255,176,32,0.06)", colorErrorBg: "rgba(229,72,77,0.06)" },
    Message: { contentBg: LIGHT_BG },
    Notification: { colorBgElevated: LIGHT_BG },
    Tabs: { cardBg: LIGHT_BG },
    Pagination: { colorBgContainer: LIGHT_BG },
    Breadcrumb: { colorBgContainer: LIGHT_BG },
    Descriptions: { colorBgContainer: LIGHT_BG },
  },
};
