import { useCallback } from "react";
import { useDropzone } from "react-dropzone";
import { Upload, Loader2 } from "lucide-react";

export default function FileDropzone({ onDrop, uploading, progress }) {
  const onDropAccepted = useCallback(
    (files) => {
      onDrop(files);
    },
    [onDrop],
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop: onDropAccepted,
    multiple: true,
    disabled: uploading,
  });

  const progressLabel =
    progress < 95
      ? "Sending chunks... " + progress + "%"
      : progress < 100
        ? "Verifying integrity..."
        : "Done";

  return (
    <div
      {...getRootProps()}
      className={[
        "rounded-[12px] border border-dashed p-6 text-center transition-all duration-200 ease-in-out",
        isDragActive
          ? "border-green-500 bg-[#052E1B]"
          : "border-[#1F2937] bg-[#0B0F14] hover:border-[#2B3B4F] hover:bg-[#0F1722]",
        uploading ? "cursor-not-allowed opacity-70" : "cursor-pointer",
      ].join(" ")}
    >
      <input {...getInputProps()} />
      {uploading ? (
        <div className="space-y-4">
          <Loader2 className="mx-auto animate-spin text-green-400" size={28} />
          <p className="text-sm text-[#9CA3AF]">{progressLabel}</p>
          <div className="progress-rail">
            <div
              className="progress-fill"
              style={{ width: progress + "%" }}
            />
          </div>
          <p className="text-xs text-[#6B7280]">
            Each chunk is CRC-32 checked and the full file is SHA-256 verified.
          </p>
        </div>
      ) : (
        <div>
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-[12px] border border-[#1F2937] bg-[#111827] text-green-400">
            <Upload size={22} />
          </div>
          {isDragActive ? (
            <p className="text-sm font-medium text-green-400">Drop files to upload</p>
          ) : (
            <>
              <p className="text-sm text-[#9CA3AF]">
                Drag and drop files here, or <span className="text-[#F9FAFB]">browse</span>
              </p>
              <p className="mt-2 text-xs text-[#6B7280]">Max 100 MB per file</p>
            </>
          )}
        </div>
      )}
    </div>
  );
}
