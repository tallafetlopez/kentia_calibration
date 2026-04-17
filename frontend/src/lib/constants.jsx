export const LIFECYCLE_STATES = [
  "EDIT",
  "UNDER_APPROVAL",
  "APPROVED",
  "RELEASE_CANDIDATE",
  "RELEASED",
  "DEPRECATED",
];

export const DEPLOYMENT_CONTEXTS = [
  "DEVELOPMENT",
  "PRODUCTION",
  "VARIANT_SPECIFIC",
  "POST_SALES",
  "VIN_SPECIFIC",
];

export const CREATION_MODES = ["IMPORT_S37", "COPY_EXISTING", "MERGE", "REUSE_BASELINE"];

export const LABEL_CONFIDENCE = ["EMPTY", "CALIBRATED", "VALIDATED", "DOCUMENTED"];
export const LABEL_LEVELS = ["CONFIGURATION", "CARRY_OVER", "VARIANT_SPECIFIC", "VEHICLE_SPECIFIC"];

export const ROLES_LIST = [
  "PD_Project_Manager",
  "Calibration_Engineer",
  "PI_Engineering_Manager",
  "PI_Regulatory_Compliance_Specialist",
  "PD_Verification_Validation_Engineer",
  "Configuration_Manager",
  "DM_Administrator",
  "Post_Sales_Engineer",
];

export function fmtDate(iso) {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    return d.toLocaleString(undefined, {
      year: "numeric",
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export function fmtDateShort(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "2-digit", year: "numeric" });
  } catch {
    return iso;
  }
}

export function LifecycleBadge({ state }) {
  return (
    <span className={`lc-badge lc-${state}`} data-testid={`lc-badge-${state}`}>
      <span className="w-1.5 h-1.5 rounded-full bg-current opacity-70" />
      {state.replaceAll("_", " ")}
    </span>
  );
}
