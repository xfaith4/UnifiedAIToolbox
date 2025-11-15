export function LoadingBar({ show }: { show: boolean }) {
  return show ? (
    <div className="fixed left-0 top-0 w-full h-1 bg-transparent">
      <div className="h-1 w-1/3 animate-[loading_1.2s_infinite] bg-brand-500 rounded-full" />
      <style>{`@keyframes loading { 0%{margin-left:-33%} 50%{margin-left:66%} 100%{margin-left:100%} }`}</style>
    </div>
  ) : null
}
