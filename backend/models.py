from pydantic import BaseModel, Field, EmailStr
from typing import List, Optional, Literal
from datetime import datetime, timezone
import uuid
from enum import Enum


# ------- WorkPackage -------

class WorkPackage(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    code: str                         # AIR_ADM, TRQ_ADM, FUE_DFC, …
    name: str
    description: str = ""
    ecu_id: str
    sub_workpackage: Optional[str] = None
    responsible: Literal["BeGas", "HERKO", "Shared"] = "BeGas"
    active: bool = True
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

class WorkPackageCreate(BaseModel):
    code: str
    name: str
    description: str = ""
    ecu_id: str
    sub_workpackage: Optional[str] = None
    responsible: Literal["BeGas", "HERKO", "Shared"] = "BeGas"

class WorkPackageUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    sub_workpackage: Optional[str] = None
    responsible: Optional[Literal["BeGas", "HERKO", "Shared"]] = None
    active: Optional[bool] = None

# ------- Calibration Files -------

class CalibrationFileType(str, Enum):
    A2L = "A2L"
    DCM = "DCM"
    S37 = "S37"
    OTHER = "OTHER"

def _uuid() -> str:
    return str(uuid.uuid4())

def _now() -> str:
    return datetime.now(timezone.utc).isoformat()

class CalibrationFile(BaseModel):
    id: str = Field(default_factory=_uuid)
    filename: str
    filetype: CalibrationFileType
    upload_date: str = Field(default_factory=_now)
    uploaded_by: str
    description: str = ""
    related_software_release_id: Optional[str] = None
    related_dataset_id: Optional[str] = None
    gridfs_id: Optional[str] = None  # Si se almacena en GridFS
    metadata: dict = Field(default_factory=dict)

# ------- Roles -------
ROLES = [
    "PD_Project_Manager",
    "Calibration_Engineer",
    "PI_Engineering_Manager",
    "PI_Regulatory_Compliance_Specialist",
    "PD_Verification_Validation_Engineer",
    "Configuration_Manager",
    "DM_Administrator",
    "Post_Sales_Engineer",
]

LifecycleState = Literal[
    "EDIT", "UNDER_APPROVAL", "APPROVED", "RELEASE_CANDIDATE", "RELEASED", "DEPRECATED"
]

SRStatus = Literal["DRAFT", "VALID_FOR_CALIBRATION", "ARCHIVED"]

CreationMode = Literal["IMPORT_S37", "COPY_EXISTING", "MERGE", "REUSE_BASELINE"]

DeploymentContext = Literal[
    "DEVELOPMENT", "PRODUCTION", "VARIANT_SPECIFIC", "POST_SALES", "VIN_SPECIFIC"
]

ReviewStatus = Literal["PENDING", "ACCEPTED", "REWORK_REQUIRED"]
LabelConfidence = Literal["EMPTY", "CALIBRATED", "VALIDATED", "DOCUMENTED"]
LabelLevel = Literal["CONFIGURATION", "CARRY_OVER", "VARIANT_SPECIFIC", "VEHICLE_SPECIFIC"]
YesNo = Literal["YES", "NO"]
LabelOwner = Literal["BeGas", "HERKO", "Shared"]
LabelMaturity = Literal["0", "25", "75", "100", "Deprecated"]

# ------- Users -------
class UserPublic(BaseModel):
    id: str
    email: EmailStr
    name: str
    roles: List[str] = []
    active_role: Optional[str] = None
    created_at: str

class RegisterBody(BaseModel):
    email: EmailStr
    password: str
    name: str
    roles: Optional[List[str]] = None

class LoginBody(BaseModel):
    email: EmailStr
    password: str

class SwitchRoleBody(BaseModel):
    role: str

# ------- ECU -------
class ECU(BaseModel):
    id: str = Field(default_factory=_uuid)
    name: str
    type: str
    active: bool = True

# ------- Software Release -------
class SoftwareRelease(BaseModel):
    id: str = Field(default_factory=_uuid)
    ecu_id: str
    software_release_identifier: str
    version: str
    description: str = ""
    supplier: str = ""
    release_date: str = Field(default_factory=_now)
    status: SRStatus = "DRAFT"
    a2l_file_reference: Optional[str] = None
    dbc_reference: Optional[str] = None
    dtc_list_reference: Optional[str] = None
    other_artefacts: List[str] = []
    validation_log: List[dict] = []

class SoftwareReleaseCreate(BaseModel):
    ecu_id: str
    software_release_identifier: str
    version: str
    description: str = ""
    supplier: str = ""
    a2l_file_reference: Optional[str] = None
    dbc_reference: Optional[str] = None
    dtc_list_reference: Optional[str] = None
    other_artefacts: List[str] = []

# ------- Dataset -------
class ReviewBlock(BaseModel):
    technical: ReviewStatus = "PENDING"
    project_configuration: ReviewStatus = "PENDING"
    regulatory: ReviewStatus = "PENDING"
    vnv: ReviewStatus = "PENDING"
    technical_comments: str = ""
    project_configuration_comments: str = ""
    regulatory_comments: str = ""
    vnv_comments: str = ""
    vnv_report_reference: Optional[str] = None
    approval_decision: Optional[Literal["APPROVED", "REJECTED"]] = None
    approval_date: Optional[str] = None
    approved_by: Optional[str] = None

class Dataset(BaseModel):
    id: str = Field(default_factory=_uuid)
    dataset_name: str
    ecu_id: str
    software_release_id: str
    lifecycle_state: LifecycleState = "EDIT"
    creation_mode: CreationMode = "IMPORT_S37"
    deployment_context: DeploymentContext = "DEVELOPMENT"
    variant_id: Optional[str] = None
    vin: Optional[str] = None
    baseline_dataset_id: Optional[str] = None
    author: str = ""
    creation_date: str = Field(default_factory=_now)
    last_modified_date: str = Field(default_factory=_now)
    technical_validation_status: Literal["NOT_RUN", "PASS", "FAIL"] = "NOT_RUN"
    technical_validation_summary: List[str] = []
    locked: bool = False
    deployed: bool = False
    release_candidate_flag: bool = False
    changelog_summary: str = ""
    review: ReviewBlock = Field(default_factory=ReviewBlock)
    selected_deployment_context: Optional[DeploymentContext] = None
    selected_variant_id: Optional[str] = None
    selection_justification: Optional[str] = None
    selected_by: Optional[str] = None
    selection_date: Optional[str] = None
    deprecation_justification: Optional[str] = None
    deprecation_replacement_id: Optional[str] = None
    deprecation_date: Optional[str] = None
    is_post_sales_derived: bool = False

class DatasetCreate(BaseModel):
    dataset_name: str
    software_release_id: str
    creation_mode: CreationMode
    deployment_context: DeploymentContext
    variant_id: Optional[str] = None
    vin: Optional[str] = None
    baseline_dataset_id: Optional[str] = None
    changelog_summary: str = ""

# ------- Label -------
class Label(BaseModel):
    id: str = Field(default_factory=_uuid)
    dataset_id: str
    label_name: str
    data_type: str
    current_value: str = ""
    unit: str = ""
    level: LabelLevel = "CONFIGURATION"
    confidence_status: LabelConfidence = "EMPTY"
    last_modified_by: str = ""
    last_modification_date: str = Field(default_factory=_now)
    regulatory_relevance: YesNo = "NO"
    regulation_reference: str = ""
    parametrizable_in_customer: YesNo = "NO"
    parametrizable_override_justification: str = ""
    change_justification: str = ""
    comments: str = ""
    imported_from_a2l: bool = True
    modified: bool = False
    # --- BeGas req #3: responsibility ---
    owner: LabelOwner = "BeGas"
    deputy: str = ""
    # --- BeGas req #4: WorkPackage ---
    work_package_id: Optional[str] = None
    # --- BeGas req #13: maturity ---
    maturity: LabelMaturity = "0"

class LabelUpdate(BaseModel):
    current_value: Optional[str] = None
    level: Optional[LabelLevel] = None
    confidence_status: Optional[LabelConfidence] = None
    regulatory_relevance: Optional[YesNo] = None
    regulation_reference: Optional[str] = None
    parametrizable_in_customer: Optional[YesNo] = None
    parametrizable_override_justification: Optional[str] = None
    change_justification: Optional[str] = None
    comments: Optional[str] = None
    owner: Optional[LabelOwner] = None
    deputy: Optional[str] = None
    work_package_id: Optional[str] = None
    maturity: Optional[LabelMaturity] = None

# ------- Vehicle_SW_ID -------
class VehicleSWID(BaseModel):
    id: str = Field(default_factory=_uuid)
    software_release_id: str
    dataset_id: str
    variant_id: Optional[str] = None
    vin: Optional[str] = None
    manufacturing_order_reference: Optional[str] = None
    service_case_reference: Optional[str] = None
    creation_date: str = Field(default_factory=_now)
    created_by: str = ""

class VehicleSWIDCreate(BaseModel):
    dataset_id: str
    variant_id: Optional[str] = None
    vin: Optional[str] = None
    manufacturing_order_reference: Optional[str] = None
    service_case_reference: Optional[str] = None

# ------- Audit Log -------
class AuditEntry(BaseModel):
    id: str = Field(default_factory=_uuid)
    entity_type: str
    entity_id: str
    action: str
    previous_value: Optional[str] = None
    new_value: Optional[str] = None
    author: str = ""
    date: str = Field(default_factory=_now)
    justification: str = ""

# ------- Action bodies -------
class ReviewUpdate(BaseModel):
    domain: Literal["technical", "project_configuration", "regulatory", "vnv"]
    status: ReviewStatus
    comments: Optional[str] = None
    vnv_report_reference: Optional[str] = None

class ReleaseSelectBody(BaseModel):
    selected_deployment_context: DeploymentContext
    selected_variant_id: Optional[str] = None
    selection_justification: str

class DeprecateBody(BaseModel):
    justification: str
    replacement_dataset_id: Optional[str] = None

class DeriveBody(BaseModel):
    dataset_name: str
    vin: Optional[str] = None
    variant_id: Optional[str] = None
    service_case_reference: Optional[str] = None
    changelog_summary: str = ""

class LabelMassUpdate(BaseModel):
    label_ids: List[str]
    patch: LabelUpdate

# ------- A2L Upload/Parse -------
class A2LUploadResponse(BaseModel):
    filename: str
    size_bytes: int
    uploaded_at: str

class A2LParseResult(BaseModel):
    project_name: str
    version: str
    total_parameters: int
    scalars: List[dict] = []
    maps: List[dict] = []
    curves: List[dict] = []

class A2LFileInfo(BaseModel):
    filename: Optional[str] = None
    size_bytes: int = 0
    uploaded_at: Optional[str] = None
    has_file: bool = False
