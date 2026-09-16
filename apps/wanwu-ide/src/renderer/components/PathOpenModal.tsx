import React, { useState } from "react";

interface Props {
  initial: string;
  onConfirm: (path: string) => void;
  onCancel: () => void;
}

export function PathOpenModal({ initial, onConfirm, onCancel }: Props): React.ReactElement {
  const [value, setValue] = useState(initial);
  return (
    <div className="modal-overlay">
      <div className="modal path-modal">
        <h3>按路径打开工作区</h3>
        <input
          autoFocus
          className="path-input"
          placeholder="/绝对/路径/到/项目"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && value.trim()) onConfirm(value.trim());
            if (e.key === "Escape") onCancel();
          }}
        />
        <div className="modal-actions">
          <button className="btn-secondary" onClick={onCancel}>
            取消
          </button>
          <button className="btn-primary" onClick={() => value.trim() && onConfirm(value.trim())}>
            打开
          </button>
        </div>
      </div>
    </div>
  );
}
