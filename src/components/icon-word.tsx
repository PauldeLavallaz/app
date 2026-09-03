export function Icon() {
  return (
    <div
      aria-label="Morfeo Deploy"
      className="flex h-[47px] w-[220px] items-center gap-2.5 text-zinc-950 dark:text-white"
    >
      <span className="relative flex h-8 w-8 shrink-0 items-center justify-center">
        <img
          src="/morfeo-icon-light.svg"
          alt=""
          aria-hidden="true"
          className="h-8 w-8 dark:hidden"
        />
        <img
          src="/morfeo-icon.svg"
          alt=""
          aria-hidden="true"
          className="hidden h-8 w-8 dark:block"
        />
      </span>
      <span className="font-bold text-[25px] leading-none tracking-normal">
        Morfeo Deploy
      </span>
    </div>
  );
}
