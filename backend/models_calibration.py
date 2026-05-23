from pydantic import BaseModel, Field
from typing import Optional, List, Any, Literal


class CalibValueRead(BaseModel):
    sw_release_id: str
    label_name: str
    type: Literal["scalar", "curve", "map"]
    wp_value: Any
    rp_value: Any
    modified: bool = False
    modified_at: Optional[str] = None
    modified_by: Optional[str] = None


class CalibCellUpdate(BaseModel):
    cells: List[List[int]] = Field(default_factory=list)


class CalibUpdate(CalibCellUpdate):
    operation: Literal["set", "add", "multiply", "percentage", "smooth", "interpolate", "reset"]
    value: Optional[float] = None
    smooth_passes: int = 1
    interpolate_axis: Optional[Literal["row", "col", "both"]] = None
    justification: Optional[str] = None


class CalibResetRequest(BaseModel):
    cells: Any = "all"  # List[List[int]] | "all"
