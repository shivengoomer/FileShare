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

  return (
    <div
      {...getRootProps()}
      className={`
        border-2 border-dashed rounded-xl p-6 text-center cursor-pointer
        transition-all duration-200
        ${isDragActive ? "border-brand-500 bg-brand-600/10" : "border-gray-700 hover:border-gray-600"}
        ${uploading ? "opacity-60 cursor-not-allowed" : ""}
      `}
    >
      <input {...getInputProps()} />
      {uploading ? (
        <div className="space-y-3">
          <Loader2 className="mx-auto animate-spin text-brand-400" size={28} />
          <p className="text-sm text-gray-400">Uploading… {progress}%</p>
          <div className="w-full bg-gray-800 rounded-full h-2">
            <div
              className="bg-brand-500 h-2 rounded-full transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      ) : (
        <div>
          <Upload className="mx-auto mb-2 text-gray-500" size={28} />
          {isDragActive ? (
            <p className="text-sm text-brand-400">Drop files here…</p>
          ) : (
            <div>
              <p className="text-sm text-gray-400">
                Drag & drop files here, or{" "}
                <span className="text-brand-400 underline">browse</span>
              </p>
              <p className="text-xs text-gray-600 mt-1">Max 100 MB per file</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
