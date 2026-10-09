"use client";

import React, { useId } from "react";
import type { NodeManifest, NodeConfigFieldMetadata } from "../../types/workflow-flow";

export interface NodeConfigFormProps {
  manifest: NodeManifest;
  config: Record<string, unknown>;
  onChange: (updatedConfig: Record<string, unknown>) => void;
  fieldErrors?: Record<string, string>;
}

export function NodeConfigForm({
  manifest,
  config,
  onChange,
  fieldErrors = {},
}: NodeConfigFormProps) {
  const formId = useId();

  const handleFieldChange = (fieldName: string, value: unknown) => {
    const updated = {
      ...config,
      [fieldName]: value,
    };
    onChange(updated);
  };

  const renderControl = (field: NodeConfigFieldMetadata) => {
    const inputId = `${formId}_${field.name}`;
    const rawValue = config[field.name];
    const value = rawValue !== undefined ? rawValue : field.defaultValue ?? "";

    const commonInputStyle: React.CSSProperties = {
      width: "100%",
      padding: "8px 10px",
      fontSize: "0.85rem",
      backgroundColor: "var(--bg-primary)",
      color: "var(--text-primary)",
      border: `1px solid ${fieldErrors[field.name] ? "var(--status-red)" : "var(--border-color)"}`,
      borderRadius: "6px",
      outline: "none",
      boxSizing: "border-box",
    };

    switch (field.type) {
      case "select":
        return (
          <select
            id={inputId}
            value={String(value)}
            onChange={(e) => handleFieldChange(field.name, e.target.value)}
            style={{
              ...commonInputStyle,
              cursor: "pointer",
            }}
          >
            {!field.required && <option value="">-- Select --</option>}
            {field.options?.map((opt) => (
              <option key={String(opt.value)} value={String(opt.value)}>
                {opt.label}
              </option>
            ))}
          </select>
        );

      case "boolean":
        return (
          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginTop: "4px" }}>
            <input
              id={inputId}
              type="checkbox"
              checked={Boolean(value)}
              onChange={(e) => handleFieldChange(field.name, e.target.checked)}
              style={{
                width: "16px",
                height: "16px",
                cursor: "pointer",
                accentColor: "var(--accent-blue)",
              }}
            />
            <label
              htmlFor={inputId}
              style={{
                fontSize: "0.85rem",
                color: "var(--text-secondary)",
                cursor: "pointer",
                userSelect: "none",
              }}
            >
              {Boolean(value) ? "Enabled" : "Disabled"}
            </label>
          </div>
        );

      case "number":
        return (
          <input
            id={inputId}
            type="number"
            value={value !== undefined && value !== null ? Number(value) : ""}
            onChange={(e) => {
              const val = e.target.value.trim();
              handleFieldChange(field.name, val === "" ? undefined : Number(val));
            }}
            placeholder={field.description || `Enter ${field.label}`}
            style={commonInputStyle}
          />
        );

      case "json":
        return (
          <textarea
            id={inputId}
            rows={4}
            value={typeof value === "object" ? JSON.stringify(value, null, 2) : String(value)}
            onChange={(e) => {
              try {
                const parsed = JSON.parse(e.target.value);
                handleFieldChange(field.name, parsed);
              } catch {
                handleFieldChange(field.name, e.target.value);
              }
            }}
            placeholder={'{\n  "key": "value"\n}'}
            style={{
              ...commonInputStyle,
              fontFamily: "monospace",
              resize: "vertical",
            }}
          />
        );

      case "string":
      default: {
        const isMultiline =
          field.name.toLowerCase().includes("template") ||
          field.name.toLowerCase().includes("instruction") ||
          field.name.toLowerCase().includes("prompt") ||
          field.name.toLowerCase().includes("description");

        if (isMultiline) {
          return (
            <textarea
              id={inputId}
              rows={3}
              value={String(value ?? "")}
              onChange={(e) => handleFieldChange(field.name, e.target.value)}
              placeholder={field.description || `Enter ${field.label}`}
              style={{
                ...commonInputStyle,
                fontFamily: "inherit",
                resize: "vertical",
              }}
            />
          );
        }

        return (
          <input
            id={inputId}
            type="text"
            value={String(value ?? "")}
            onChange={(e) => handleFieldChange(field.name, e.target.value)}
            placeholder={field.description || `Enter ${field.label}`}
            style={commonInputStyle}
          />
        );
      }
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
      {manifest.configFields.map((field) => {
        const error = fieldErrors[field.name];
        const isMissingRequired =
          field.required &&
          (config[field.name] === undefined ||
            config[field.name] === null ||
            (typeof config[field.name] === "string" && (config[field.name] as string).trim() === ""));

        return (
          <div key={field.name} style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <label
                htmlFor={`${formId}_${field.name}`}
                style={{
                  fontSize: "0.8rem",
                  fontWeight: 600,
                  color: isMissingRequired ? "var(--status-red)" : "var(--text-secondary)",
                }}
              >
                {field.label}
                {field.required && (
                  <span style={{ color: "var(--status-red)", marginLeft: "4px" }} title="Required field">
                    *
                  </span>
                )}
              </label>
              <span
                style={{
                  fontSize: "0.7rem",
                  color: "var(--text-muted)",
                  fontFamily: "monospace",
                }}
              >
                {field.type}
              </span>
            </div>

            {renderControl(field)}

            {field.description && (
              <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", lineHeight: 1.3 }}>
                {field.description}
              </span>
            )}

            {(error || isMissingRequired) && (
              <span style={{ fontSize: "0.75rem", color: "var(--status-red)", fontWeight: 500 }}>
                {error || `Field '${field.label}' is required`}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
