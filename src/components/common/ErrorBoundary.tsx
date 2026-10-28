import React from 'react';

interface State {
  hasError: boolean;
  message: string;
}

/**
 * حاجز أخطاء React عام — أي استثناء غير متوقع في أي صفحة يعرض شاشة عربية
 * واضحة مع زر استرجاع بدل تحوّل الشاشة كلها إلى فراغ أبيض صامت.
 * يطبع التفاصيل على Console التطوير ليبقى السبب قابلًا للتتبّع.
 */
export class AppErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  state: State = { hasError: false, message: '' };

  static getDerivedStateFromError(err: unknown): State {
    return { hasError: true, message: err instanceof Error ? err.message : String(err) };
  }

  componentDidCatch(err: unknown, info: React.ErrorInfo) {
    console.error('[ErrorBoundary] خطأ غير متوقع في الواجهة:', err, info.componentStack);
  }

  handleRetry = () => {
    this.setState({ hasError: false, message: '' });
  };

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <div className="min-h-[50vh] flex items-center justify-center p-6" dir="rtl">
        <div className="card-glass max-w-md w-full p-8 text-center space-y-4 rounded-xl border border-[var(--cds-border-subtle)] bg-[var(--cds-layer-01)]">
          <div className="w-12 h-12 mx-auto rounded-full bg-[#da1e28]/10 text-[#fa4d56] flex items-center justify-center text-2xl font-bold">
            !
          </div>
          <h2 className="text-base font-bold text-[var(--cds-text-01)]">حدث خطأ غير متوقع</h2>
          <p className="text-xs text-[var(--cds-text-02)] leading-relaxed">
            تعذّر عرض هذا القسم بسبب مشكلة تقنية. جرّب إعادة المحاولة — إن استمر الخطأ أعد تحميل الصفحة ثم تواصل مع فريق الدعم إن مشكلة العرض باقية.
          </p>
          <p className="text-[11px] font-mono text-[var(--cds-text-03)] break-all" dir="ltr">
            {this.state.message || 'Unknown error'}
          </p>
          <div className="flex items-center justify-center gap-2 pt-1">
            <button
              onClick={this.handleRetry}
              className="h-9 px-4 rounded-lg bg-[var(--cds-interactive-01)] hover:bg-[var(--cds-interactive-01-hover)] text-white text-xs font-semibold transition-colors"
            >
              إعادة المحاولة
            </button>
            <button
              onClick={() => window.location.reload()}
              className="h-9 px-4 rounded-lg border border-[var(--cds-border-strong)] text-[var(--cds-text-01)] text-xs font-semibold hover:bg-[var(--cds-layer-02)] transition-colors"
            >
              إعادة تحميل الصفحة
            </button>
          </div>
        </div>
      </div>
    );
  }
}
