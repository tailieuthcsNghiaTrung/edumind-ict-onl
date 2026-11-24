import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
}

export default class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      message: error?.message || 'Đã xảy ra lỗi không mong muốn.',
    };
  }

  componentDidCatch(error: Error) {
    console.error('Application ErrorBoundary caught:', error);
  }

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    let friendlyMessage = 'Hệ thống gặp sự cố tạm thời. Vui lòng tải lại trang.';
    if (this.state.message.includes('Missing or insufficient permissions')) {
      friendlyMessage =
        'Tài khoản Google hiện tại chưa được cấp quyền truy cập cơ sở dữ liệu đám mây.';
    } else if (this.state.message.includes('Quota exceeded')) {
      friendlyMessage =
        'Cơ sở dữ liệu đám mây đã chạm giới hạn hạn mức miễn phí trong ngày. Hạn mức sẽ tự khôi phục vào ngày mai.';
    }

    return (
      <div className="min-h-screen bg-[#F4F7FC] flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-white rounded-3xl border border-[#DCE5F2] shadow-sm p-7 text-center space-y-4">
          <div className="w-12 h-12 rounded-2xl bg-[#FEF2F2] text-[#DC2626] flex items-center justify-center mx-auto">
            <AlertTriangle className="w-6 h-6" />
          </div>
          <h2 className="text-lg font-bold text-[#102A56]">
            Thông báo hệ thống
          </h2>
          <p className="text-sm text-[#526582] leading-relaxed">
            {friendlyMessage}
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-[#2864E8] hover:bg-[#1E52C7] text-white text-sm font-semibold transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            Tải lại ứng dụng
          </button>
        </div>
      </div>
    );
  }
}
