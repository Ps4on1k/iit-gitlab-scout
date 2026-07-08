import { Component, type ReactNode } from "react";
import { Button, Result } from "antd";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("[ErrorBoundary]", error, errorInfo);
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;

      return (
        <Result
          status="error"
          title="Произошла ошибка"
          subTitle={this.state.error?.message || "Неизвестная ошибка"}
          extra={[
            <Button key="retry" type="primary" onClick={this.handleRetry}>
              Попробовать снова
            </Button>,
            <Button key="reload" onClick={this.handleReload}>
              Перезагрузить страницу
            </Button>,
          ]}
        />
      );
    }

    return this.props.children;
  }
}
