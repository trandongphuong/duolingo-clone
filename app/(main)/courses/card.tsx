import Image from "next/image";

type CardProps = {
  title: string;
  id: number;
  imageSrc: string;
  description?: string;
  sampleUnreviewed?: boolean;
  onClick: (id: number) => void;
  disabled?: boolean;
  isActive?: boolean;
};
export function Card({
  title,
  id,
  imageSrc,
  description,
  sampleUnreviewed,
  onClick,
  disabled,
  isActive,
}: CardProps) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onClick(id)}
      aria-pressed={isActive}
      className={`flex min-h-56 min-w-0 flex-col items-start gap-4 rounded-2xl border-2 p-5 text-left hover:border-sky-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-700 disabled:opacity-50 ${isActive ? "border-sky-700 bg-sky-50" : "border-slate-200 bg-white"}`}
    >
      {imageSrc && (
        <Image
          src={imageSrc}
          alt=""
          width={64}
          height={64}
          className="h-16 w-16 rounded-lg object-cover"
        />
      )}
      <span className="break-words text-lg font-bold text-slate-900">
        {title}
      </span>
      {description && (
        <span className="text-sm text-slate-600">{description}</span>
      )}
      {sampleUnreviewed && (
        <span className="rounded bg-amber-50 px-2 py-1 text-xs font-medium text-amber-950">
          Mẫu chưa kiểm duyệt
        </span>
      )}
      <span className="mt-auto font-semibold text-sky-800">
        {isActive ? "Tiếp tục học →" : "Chọn khóa học →"}
      </span>
    </button>
  );
}
