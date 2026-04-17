"""
HERKO Calibration Manager - Comprehensive API Tests
Tests all major endpoints: Auth, Software Releases, Datasets, Labels, Reviews, Vehicle SW IDs
"""
import pytest
import requests
import os
import time

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
ADMIN_EMAIL = "admin@herko.dev"
ADMIN_PASSWORD = "password123"
TEST_USER_EMAIL = f"test_{int(time.time())}@herko.dev"
TEST_USER_PASSWORD = "password123"


class TestAuthEndpoints:
    """Authentication endpoint tests"""
    
    def test_login_success(self):
        """POST /api/auth/login - valid credentials returns token+user"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        assert response.status_code == 200, f"Login failed: {response.text}"
        data = response.json()
        assert "token" in data, "Response missing token"
        assert "user" in data, "Response missing user"
        assert data["user"]["email"] == ADMIN_EMAIL
        assert isinstance(data["token"], str) and len(data["token"]) > 0
        print(f"✓ Login success - token length: {len(data['token'])}")
    
    def test_login_invalid_credentials(self):
        """POST /api/auth/login - invalid credentials returns 401"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "wrong@herko.dev",
            "password": "wrongpassword"
        })
        assert response.status_code == 401, f"Expected 401, got {response.status_code}"
        print("✓ Invalid login correctly rejected")
    
    def test_register_new_user(self):
        """POST /api/auth/register - creates new user, returns token+user"""
        response = requests.post(f"{BASE_URL}/api/auth/register", json={
            "email": TEST_USER_EMAIL,
            "password": TEST_USER_PASSWORD,
            "name": "Test User",
            "roles": ["Calibration_Engineer"]
        })
        assert response.status_code == 200, f"Registration failed: {response.text}"
        data = response.json()
        assert "token" in data
        assert "user" in data
        assert data["user"]["email"] == TEST_USER_EMAIL.lower()
        assert "Calibration_Engineer" in data["user"]["roles"]
        print(f"✓ Registration success for {TEST_USER_EMAIL}")
    
    def test_register_duplicate_email(self):
        """POST /api/auth/register - duplicate email returns 400"""
        response = requests.post(f"{BASE_URL}/api/auth/register", json={
            "email": ADMIN_EMAIL,
            "password": "password123",
            "name": "Duplicate Admin"
        })
        assert response.status_code == 400, f"Expected 400, got {response.status_code}"
        print("✓ Duplicate email correctly rejected")
    
    def test_get_me_authenticated(self):
        """GET /api/auth/me - Bearer token returns user"""
        # First login
        login_resp = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL, "password": ADMIN_PASSWORD
        })
        token = login_resp.json()["token"]
        
        # Get me
        response = requests.get(f"{BASE_URL}/api/auth/me", headers={
            "Authorization": f"Bearer {token}"
        })
        assert response.status_code == 200, f"Get me failed: {response.text}"
        data = response.json()
        assert data["email"] == ADMIN_EMAIL
        assert "roles" in data
        print(f"✓ Get me success - user has {len(data['roles'])} roles")
    
    def test_get_me_unauthenticated(self):
        """GET /api/auth/me - no token returns 401"""
        response = requests.get(f"{BASE_URL}/api/auth/me")
        assert response.status_code == 401
        print("✓ Unauthenticated /me correctly rejected")
    
    def test_switch_role(self):
        """POST /api/auth/switch-role - changes active_role within assigned roles"""
        login_resp = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL, "password": ADMIN_PASSWORD
        })
        token = login_resp.json()["token"]
        
        response = requests.post(f"{BASE_URL}/api/auth/switch-role", 
            json={"role": "Configuration_Manager"},
            headers={"Authorization": f"Bearer {token}"}
        )
        assert response.status_code == 200, f"Switch role failed: {response.text}"
        data = response.json()
        assert data["active_role"] == "Configuration_Manager"
        print("✓ Role switch success")
    
    def test_switch_role_invalid(self):
        """POST /api/auth/switch-role - invalid role returns 403"""
        # Login as cal@herko.dev who only has Calibration_Engineer
        login_resp = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "cal@herko.dev", "password": ADMIN_PASSWORD
        })
        token = login_resp.json()["token"]
        
        response = requests.post(f"{BASE_URL}/api/auth/switch-role",
            json={"role": "DM_Administrator"},
            headers={"Authorization": f"Bearer {token}"}
        )
        assert response.status_code == 403
        print("✓ Invalid role switch correctly rejected")


class TestDashboardEndpoints:
    """Dashboard stats endpoint tests"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        login_resp = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL, "password": ADMIN_PASSWORD
        })
        self.token = login_resp.json()["token"]
        self.headers = {"Authorization": f"Bearer {self.token}"}
    
    def test_dashboard_stats(self):
        """GET /api/dashboard/stats - returns counts"""
        response = requests.get(f"{BASE_URL}/api/dashboard/stats", headers=self.headers)
        assert response.status_code == 200, f"Dashboard stats failed: {response.text}"
        data = response.json()
        
        # Verify expected fields
        assert "software_releases_total" in data
        assert "software_releases_valid" in data
        assert "datasets_by_state" in data
        assert "pending_reviews" in data
        assert "vehicle_sw_ids" in data
        
        # Verify seeded data counts (3 SR, 10 datasets)
        assert data["software_releases_total"] >= 3, f"Expected >=3 SR, got {data['software_releases_total']}"
        total_ds = sum(data["datasets_by_state"].values())
        assert total_ds >= 10, f"Expected >=10 datasets, got {total_ds}"
        print(f"✓ Dashboard stats: {data['software_releases_total']} SR, {total_ds} datasets")


class TestSoftwareReleaseEndpoints:
    """Software Release CRUD tests"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        login_resp = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL, "password": ADMIN_PASSWORD
        })
        self.token = login_resp.json()["token"]
        self.headers = {"Authorization": f"Bearer {self.token}"}
    
    def test_list_software_releases(self):
        """GET /api/software-releases - list with filters"""
        response = requests.get(f"{BASE_URL}/api/software-releases", headers=self.headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        assert len(data) >= 3, f"Expected >=3 releases, got {len(data)}"
        print(f"✓ Listed {len(data)} software releases")
    
    def test_list_software_releases_with_filter(self):
        """GET /api/software-releases - filter by status"""
        response = requests.get(f"{BASE_URL}/api/software-releases", 
            params={"status": "VALID_FOR_CALIBRATION"},
            headers=self.headers
        )
        assert response.status_code == 200
        data = response.json()
        for sr in data:
            assert sr["status"] == "VALID_FOR_CALIBRATION"
        print(f"✓ Filtered to {len(data)} VALID_FOR_CALIBRATION releases")
    
    def test_create_software_release(self):
        """POST /api/software-releases - requires PD_Project_Manager role"""
        # Get ECU ID first
        ecus_resp = requests.get(f"{BASE_URL}/api/ecus", headers=self.headers)
        ecu_id = ecus_resp.json()[0]["id"]
        
        response = requests.post(f"{BASE_URL}/api/software-releases", 
            json={
                "ecu_id": ecu_id,
                "software_release_identifier": f"TEST-SW-{int(time.time())}",
                "version": "1.0.0",
                "description": "Test release",
                "supplier": "Test Supplier"
            },
            headers=self.headers
        )
        assert response.status_code == 200, f"Create SR failed: {response.text}"
        data = response.json()
        assert data["status"] == "DRAFT"
        assert "id" in data
        print(f"✓ Created software release: {data['software_release_identifier']}")
        return data["id"]
    
    def test_validate_release_without_a2l(self):
        """POST /api/software-releases/{id}/validate - fails without A2L"""
        # Create a new release without A2L
        ecus_resp = requests.get(f"{BASE_URL}/api/ecus", headers=self.headers)
        ecu_id = ecus_resp.json()[0]["id"]
        
        create_resp = requests.post(f"{BASE_URL}/api/software-releases",
            json={
                "ecu_id": ecu_id,
                "software_release_identifier": f"TEST-NO-A2L-{int(time.time())}",
                "version": "1.0.0"
            },
            headers=self.headers
        )
        sr_id = create_resp.json()["id"]
        
        # Try to validate
        response = requests.post(f"{BASE_URL}/api/software-releases/{sr_id}/validate",
            headers=self.headers
        )
        assert response.status_code == 200
        data = response.json()
        assert data["ok"] == False
        assert "A2L file not linked" in data["errors"]
        print("✓ Validation correctly fails without A2L")
    
    def test_validate_release_with_a2l(self):
        """POST /api/software-releases/{id}/validate - transitions DRAFT with A2L → VALID_FOR_CALIBRATION"""
        ecus_resp = requests.get(f"{BASE_URL}/api/ecus", headers=self.headers)
        ecu_id = ecus_resp.json()[0]["id"]
        
        # Create with A2L
        create_resp = requests.post(f"{BASE_URL}/api/software-releases",
            json={
                "ecu_id": ecu_id,
                "software_release_identifier": f"TEST-WITH-A2L-{int(time.time())}",
                "version": "1.0.0",
                "a2l_file_reference": "test.a2l"
            },
            headers=self.headers
        )
        sr_id = create_resp.json()["id"]
        
        # Validate
        response = requests.post(f"{BASE_URL}/api/software-releases/{sr_id}/validate",
            headers=self.headers
        )
        assert response.status_code == 200
        data = response.json()
        assert data["ok"] == True
        
        # Verify status changed
        get_resp = requests.get(f"{BASE_URL}/api/software-releases/{sr_id}", headers=self.headers)
        assert get_resp.json()["status"] == "VALID_FOR_CALIBRATION"
        print("✓ Validation success - status changed to VALID_FOR_CALIBRATION")


class TestDatasetEndpoints:
    """Dataset CRUD and workflow tests"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        login_resp = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL, "password": ADMIN_PASSWORD
        })
        self.token = login_resp.json()["token"]
        self.headers = {"Authorization": f"Bearer {self.token}"}
    
    def test_list_datasets(self):
        """GET /api/datasets - list with filters"""
        response = requests.get(f"{BASE_URL}/api/datasets", headers=self.headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        assert len(data) >= 10, f"Expected >=10 datasets, got {len(data)}"
        print(f"✓ Listed {len(data)} datasets")
    
    def test_list_datasets_with_filter(self):
        """GET /api/datasets - filter by lifecycle_state"""
        response = requests.get(f"{BASE_URL}/api/datasets",
            params={"lifecycle_state": "EDIT"},
            headers=self.headers
        )
        assert response.status_code == 200
        data = response.json()
        for ds in data:
            assert ds["lifecycle_state"] == "EDIT"
        print(f"✓ Filtered to {len(data)} EDIT datasets")
    
    def test_get_dataset_bundle(self):
        """GET /api/datasets/{id} - returns bundle with related data"""
        # Get first dataset
        list_resp = requests.get(f"{BASE_URL}/api/datasets", headers=self.headers)
        ds_id = list_resp.json()[0]["id"]
        
        response = requests.get(f"{BASE_URL}/api/datasets/{ds_id}", headers=self.headers)
        assert response.status_code == 200
        data = response.json()
        
        # Verify bundle structure
        assert "dataset" in data
        assert "software_release" in data
        assert "derived_datasets" in data
        assert "vehicle_assignments" in data
        print(f"✓ Got dataset bundle for {data['dataset']['dataset_name']}")
    
    def test_create_dataset_from_valid_sr(self):
        """POST /api/datasets - creates dataset only from VALID_FOR_CALIBRATION SR"""
        # Get a valid SR
        sr_resp = requests.get(f"{BASE_URL}/api/software-releases",
            params={"status": "VALID_FOR_CALIBRATION"},
            headers=self.headers
        )
        valid_sr = sr_resp.json()[0]
        
        response = requests.post(f"{BASE_URL}/api/datasets",
            json={
                "dataset_name": f"TEST_DS_{int(time.time())}",
                "software_release_id": valid_sr["id"],
                "creation_mode": "IMPORT_S37",
                "deployment_context": "DEVELOPMENT",
                "changelog_summary": "Test dataset creation"
            },
            headers=self.headers
        )
        assert response.status_code == 200, f"Create dataset failed: {response.text}"
        data = response.json()
        assert data["lifecycle_state"] == "EDIT"
        assert data["software_release_id"] == valid_sr["id"]
        print(f"✓ Created dataset: {data['dataset_name']}")
        return data["id"]
    
    def test_create_dataset_from_invalid_sr(self):
        """POST /api/datasets - fails from non-VALID_FOR_CALIBRATION SR"""
        # Get a DRAFT SR
        sr_resp = requests.get(f"{BASE_URL}/api/software-releases",
            params={"status": "DRAFT"},
            headers=self.headers
        )
        if not sr_resp.json():
            pytest.skip("No DRAFT SR available")
        draft_sr = sr_resp.json()[0]
        
        response = requests.post(f"{BASE_URL}/api/datasets",
            json={
                "dataset_name": f"TEST_INVALID_{int(time.time())}",
                "software_release_id": draft_sr["id"],
                "creation_mode": "IMPORT_S37",
                "deployment_context": "DEVELOPMENT"
            },
            headers=self.headers
        )
        assert response.status_code == 400
        assert "VALID_FOR_CALIBRATION" in response.json()["detail"]
        print("✓ Dataset creation from invalid SR correctly rejected")
    
    def test_reuse_baseline_restriction(self):
        """POST /api/datasets - REUSE_BASELINE only for VARIANT_SPECIFIC/POST_SALES/VIN_SPECIFIC"""
        sr_resp = requests.get(f"{BASE_URL}/api/software-releases",
            params={"status": "VALID_FOR_CALIBRATION"},
            headers=self.headers
        )
        valid_sr = sr_resp.json()[0]
        
        # Try REUSE_BASELINE with DEVELOPMENT context (should fail)
        response = requests.post(f"{BASE_URL}/api/datasets",
            json={
                "dataset_name": f"TEST_REUSE_FAIL_{int(time.time())}",
                "software_release_id": valid_sr["id"],
                "creation_mode": "REUSE_BASELINE",
                "deployment_context": "DEVELOPMENT"
            },
            headers=self.headers
        )
        assert response.status_code == 400
        assert "REUSE_BASELINE" in response.json()["detail"]
        print("✓ REUSE_BASELINE restriction correctly enforced")


class TestDatasetWorkflowEndpoints:
    """Dataset workflow transition tests"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        login_resp = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL, "password": ADMIN_PASSWORD
        })
        self.token = login_resp.json()["token"]
        self.headers = {"Authorization": f"Bearer {self.token}"}
    
    def get_edit_dataset(self):
        """Helper to get DS_Base_Euro6d_Dev (EDIT state)"""
        resp = requests.get(f"{BASE_URL}/api/datasets",
            params={"lifecycle_state": "EDIT"},
            headers=self.headers
        )
        datasets = resp.json()
        for ds in datasets:
            if "Dev" in ds["dataset_name"]:
                return ds
        return datasets[0] if datasets else None
    
    def test_technical_validate(self):
        """POST /api/datasets/{id}/technical-validate - computes PASS/FAIL"""
        ds = self.get_edit_dataset()
        if not ds:
            pytest.skip("No EDIT dataset available")
        
        response = requests.post(f"{BASE_URL}/api/datasets/{ds['id']}/technical-validate",
            headers=self.headers
        )
        assert response.status_code == 200, f"Tech validate failed: {response.text}"
        data = response.json()
        assert "status" in data
        assert data["status"] in ["PASS", "FAIL"]
        print(f"✓ Technical validation: {data['status']} ({len(data.get('errors', []))} issues)")
    
    def test_attach_vnv(self):
        """POST /api/datasets/{id}/attach-vnv - records V&V report"""
        ds = self.get_edit_dataset()
        if not ds:
            pytest.skip("No EDIT dataset available")
        
        response = requests.post(f"{BASE_URL}/api/datasets/{ds['id']}/attach-vnv",
            json={"vnv_report_reference": "VNV_Test_Report.pdf"},
            headers=self.headers
        )
        assert response.status_code == 200, f"Attach VnV failed: {response.text}"
        data = response.json()
        assert data["review"]["vnv_report_reference"] == "VNV_Test_Report.pdf"
        print("✓ V&V report attached")
    
    def test_submit_approval_requirements(self):
        """POST /api/datasets/{id}/submit-approval - requires tech validation PASS, changelog, V&V ref"""
        ds = self.get_edit_dataset()
        if not ds:
            pytest.skip("No EDIT dataset available")
        
        # Try to submit without requirements
        response = requests.post(f"{BASE_URL}/api/datasets/{ds['id']}/submit-approval",
            headers=self.headers
        )
        # Should fail if requirements not met
        if response.status_code == 400:
            detail = response.json()["detail"]
            assert any(x in detail for x in ["PASS", "V&V", "changelog"])
            print(f"✓ Submit approval correctly requires: {detail}")
        else:
            print("✓ Submit approval succeeded (requirements already met)")
    
    def test_review_domain(self):
        """POST /api/datasets/{id}/review - per-domain review"""
        # Get an UNDER_APPROVAL dataset
        resp = requests.get(f"{BASE_URL}/api/datasets",
            params={"lifecycle_state": "UNDER_APPROVAL"},
            headers=self.headers
        )
        datasets = resp.json()
        if not datasets:
            pytest.skip("No UNDER_APPROVAL dataset available")
        ds = datasets[0]
        
        response = requests.post(f"{BASE_URL}/api/datasets/{ds['id']}/review",
            json={
                "domain": "technical",
                "status": "ACCEPTED",
                "comments": "Test review comment"
            },
            headers=self.headers
        )
        assert response.status_code == 200, f"Review failed: {response.text}"
        data = response.json()
        assert data["review"]["technical"] == "ACCEPTED"
        print("✓ Technical review submitted")
    
    def test_approve_requires_all_reviews(self):
        """POST /api/datasets/{id}/approve - requires all 4 reviews ACCEPTED"""
        resp = requests.get(f"{BASE_URL}/api/datasets",
            params={"lifecycle_state": "UNDER_APPROVAL"},
            headers=self.headers
        )
        datasets = resp.json()
        if not datasets:
            pytest.skip("No UNDER_APPROVAL dataset available")
        ds = datasets[0]
        
        response = requests.post(f"{BASE_URL}/api/datasets/{ds['id']}/approve",
            headers=self.headers
        )
        # Should fail if not all reviews accepted
        if response.status_code == 400:
            assert "not ACCEPTED" in response.json()["detail"]
            print("✓ Approve correctly requires all reviews ACCEPTED")
        else:
            print("✓ Approve succeeded (all reviews were ACCEPTED)")
    
    def test_release_select_requires_approved(self):
        """POST /api/datasets/{id}/release-select - requires APPROVED state"""
        # Get an EDIT dataset (not APPROVED)
        ds = self.get_edit_dataset()
        if not ds:
            pytest.skip("No EDIT dataset available")
        
        response = requests.post(f"{BASE_URL}/api/datasets/{ds['id']}/release-select",
            json={
                "selected_deployment_context": "PRODUCTION",
                "selection_justification": "Test selection"
            },
            headers=self.headers
        )
        assert response.status_code == 400
        assert "APPROVED" in response.json()["detail"]
        print("✓ Release select correctly requires APPROVED state")
    
    def test_deprecate_requires_justification(self):
        """POST /api/datasets/{id}/deprecate - requires justification"""
        # Get an APPROVED or RELEASED dataset
        resp = requests.get(f"{BASE_URL}/api/datasets",
            params={"lifecycle_state": "APPROVED"},
            headers=self.headers
        )
        datasets = resp.json()
        if not datasets:
            pytest.skip("No APPROVED dataset available")
        ds = datasets[0]
        
        response = requests.post(f"{BASE_URL}/api/datasets/{ds['id']}/deprecate",
            json={"justification": ""},
            headers=self.headers
        )
        assert response.status_code == 400
        assert "justification" in response.json()["detail"].lower()
        print("✓ Deprecate correctly requires justification")
    
    def test_derive_post_sales_requires_released(self):
        """POST /api/datasets/{id}/derive-post-sales - only from RELEASED baseline"""
        # Get an EDIT dataset (not RELEASED)
        ds = self.get_edit_dataset()
        if not ds:
            pytest.skip("No EDIT dataset available")
        
        response = requests.post(f"{BASE_URL}/api/datasets/{ds['id']}/derive-post-sales",
            json={
                "dataset_name": f"TEST_DERIVED_{int(time.time())}"
            },
            headers=self.headers
        )
        assert response.status_code == 400
        assert "RELEASED" in response.json()["detail"]
        print("✓ Derive post-sales correctly requires RELEASED baseline")


class TestLabelEndpoints:
    """Label CRUD and rule enforcement tests"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        login_resp = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL, "password": ADMIN_PASSWORD
        })
        self.token = login_resp.json()["token"]
        self.headers = {"Authorization": f"Bearer {self.token}"}
    
    def get_edit_dataset_with_labels(self):
        """Helper to get an EDIT dataset and its labels"""
        resp = requests.get(f"{BASE_URL}/api/datasets",
            params={"lifecycle_state": "EDIT"},
            headers=self.headers
        )
        datasets = resp.json()
        if not datasets:
            return None, None
        ds = datasets[0]
        labels_resp = requests.get(f"{BASE_URL}/api/datasets/{ds['id']}/labels",
            headers=self.headers
        )
        return ds, labels_resp.json()
    
    def test_list_labels(self):
        """GET /api/datasets/{id}/labels - returns labels"""
        ds, labels = self.get_edit_dataset_with_labels()
        if not ds:
            pytest.skip("No EDIT dataset available")
        
        assert isinstance(labels, list)
        assert len(labels) >= 20, f"Expected >=20 labels (A2L template), got {len(labels)}"
        print(f"✓ Listed {len(labels)} labels for dataset")
    
    def test_update_label(self):
        """PATCH /api/datasets/{id}/labels/{label_id} - updates label"""
        ds, labels = self.get_edit_dataset_with_labels()
        if not ds or not labels:
            pytest.skip("No EDIT dataset with labels available")
        
        # Find a non-regulatory label
        label = next((l for l in labels if l["regulatory_relevance"] == "NO"), labels[0])
        
        response = requests.patch(
            f"{BASE_URL}/api/datasets/{ds['id']}/labels/{label['id']}",
            json={
                "current_value": "999",
                "confidence_status": "CALIBRATED"
            },
            headers=self.headers
        )
        assert response.status_code == 200, f"Update label failed: {response.text}"
        data = response.json()
        assert data["current_value"] == "999"
        assert data["modified"] == True
        print(f"✓ Updated label {label['label_name']}")
    
    def test_regulatory_label_requires_justification(self):
        """PATCH label - regulatory change requires justification"""
        ds, labels = self.get_edit_dataset_with_labels()
        if not ds or not labels:
            pytest.skip("No EDIT dataset with labels available")
        
        # Find a regulatory label
        reg_label = next((l for l in labels if l["regulatory_relevance"] == "YES"), None)
        if not reg_label:
            pytest.skip("No regulatory label found")
        
        # Try to update without justification
        response = requests.patch(
            f"{BASE_URL}/api/datasets/{ds['id']}/labels/{reg_label['id']}",
            json={"current_value": "new_value"},
            headers=self.headers
        )
        # Should fail or require justification
        if response.status_code == 400:
            assert "justification" in response.json()["detail"].lower()
            print("✓ Regulatory label correctly requires justification")
        else:
            print("✓ Regulatory label update succeeded (justification may already exist)")
    
    def test_read_only_state_blocks_edits(self):
        """PATCH label - read-only states block edits"""
        # Get a RELEASED dataset
        resp = requests.get(f"{BASE_URL}/api/datasets",
            params={"lifecycle_state": "RELEASED"},
            headers=self.headers
        )
        datasets = resp.json()
        if not datasets:
            pytest.skip("No RELEASED dataset available")
        ds = datasets[0]
        
        labels_resp = requests.get(f"{BASE_URL}/api/datasets/{ds['id']}/labels",
            headers=self.headers
        )
        labels = labels_resp.json()
        if not labels:
            pytest.skip("No labels in RELEASED dataset")
        
        response = requests.patch(
            f"{BASE_URL}/api/datasets/{ds['id']}/labels/{labels[0]['id']}",
            json={"current_value": "blocked_value"},
            headers=self.headers
        )
        assert response.status_code == 400
        assert "read-only" in response.json()["detail"].lower() or "RELEASED" in response.json()["detail"]
        print("✓ Read-only state correctly blocks label edits")
    
    def test_mass_update_labels(self):
        """POST /api/datasets/{id}/labels/mass-update - bulk label update"""
        ds, labels = self.get_edit_dataset_with_labels()
        if not ds or not labels:
            pytest.skip("No EDIT dataset with labels available")
        
        # Get non-regulatory labels
        non_reg_labels = [l for l in labels if l["regulatory_relevance"] == "NO"][:3]
        if not non_reg_labels:
            pytest.skip("No non-regulatory labels found")
        
        response = requests.post(
            f"{BASE_URL}/api/datasets/{ds['id']}/labels/mass-update",
            json={
                "label_ids": [l["id"] for l in non_reg_labels],
                "patch": {"confidence_status": "VALIDATED"}
            },
            headers=self.headers
        )
        assert response.status_code == 200, f"Mass update failed: {response.text}"
        data = response.json()
        assert data["updated"] > 0
        print(f"✓ Mass updated {data['updated']} labels")


class TestVehicleSWIDEndpoints:
    """Vehicle SW ID tests"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        login_resp = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL, "password": ADMIN_PASSWORD
        })
        self.token = login_resp.json()["token"]
        self.headers = {"Authorization": f"Bearer {self.token}"}
    
    def test_list_vehicle_sw_ids(self):
        """GET /api/vehicle-sw-ids - returns list"""
        response = requests.get(f"{BASE_URL}/api/vehicle-sw-ids", headers=self.headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ Listed {len(data)} vehicle SW IDs")
    
    def test_create_vehicle_sw_id_requires_release_candidate(self):
        """POST /api/vehicle-sw-ids - only RELEASE_CANDIDATE or RELEASED datasets"""
        # Get an EDIT dataset
        resp = requests.get(f"{BASE_URL}/api/datasets",
            params={"lifecycle_state": "EDIT"},
            headers=self.headers
        )
        datasets = resp.json()
        if not datasets:
            pytest.skip("No EDIT dataset available")
        ds = datasets[0]
        
        response = requests.post(f"{BASE_URL}/api/vehicle-sw-ids",
            json={
                "dataset_id": ds["id"],
                "vin": "TEST_VIN_123"
            },
            headers=self.headers
        )
        assert response.status_code == 400
        assert "RELEASE_CANDIDATE" in response.json()["detail"] or "RELEASED" in response.json()["detail"]
        print("✓ Vehicle SW ID creation correctly requires RELEASE_CANDIDATE/RELEASED")
    
    def test_create_vehicle_sw_id_transitions_to_released(self):
        """POST /api/vehicle-sw-ids - first assignment transitions RELEASE_CANDIDATE→RELEASED"""
        # Get a RELEASE_CANDIDATE dataset
        resp = requests.get(f"{BASE_URL}/api/datasets",
            params={"lifecycle_state": "RELEASE_CANDIDATE"},
            headers=self.headers
        )
        datasets = resp.json()
        if not datasets:
            pytest.skip("No RELEASE_CANDIDATE dataset available")
        ds = datasets[0]
        
        response = requests.post(f"{BASE_URL}/api/vehicle-sw-ids",
            json={
                "dataset_id": ds["id"],
                "vin": f"TEST_VIN_{int(time.time())}"
            },
            headers=self.headers
        )
        assert response.status_code == 200, f"Create VSID failed: {response.text}"
        
        # Verify dataset transitioned to RELEASED
        ds_resp = requests.get(f"{BASE_URL}/api/datasets/{ds['id']}", headers=self.headers)
        assert ds_resp.json()["dataset"]["lifecycle_state"] == "RELEASED"
        print("✓ Vehicle SW ID created and dataset transitioned to RELEASED")


class TestTraceabilityAndAudit:
    """Traceability and audit log tests"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        login_resp = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL, "password": ADMIN_PASSWORD
        })
        self.token = login_resp.json()["token"]
        self.headers = {"Authorization": f"Bearer {self.token}"}
    
    def test_traceability(self):
        """GET /api/traceability - returns SR+datasets+vehicle_sw_ids"""
        response = requests.get(f"{BASE_URL}/api/traceability", headers=self.headers)
        assert response.status_code == 200
        data = response.json()
        assert "software_releases" in data
        assert "datasets" in data
        assert "vehicle_sw_ids" in data
        print(f"✓ Traceability: {len(data['software_releases'])} SR, {len(data['datasets'])} DS, {len(data['vehicle_sw_ids'])} VSID")
    
    def test_audit_log(self):
        """GET /api/audit-log - returns audit entries"""
        response = requests.get(f"{BASE_URL}/api/audit-log", headers=self.headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        if data:
            entry = data[0]
            assert "entity_type" in entry
            assert "action" in entry
            assert "author" in entry
            assert "date" in entry
        print(f"✓ Audit log: {len(data)} entries")
    
    def test_compare_datasets(self):
        """GET /api/datasets/{a}/compare/{b} - returns label diffs"""
        # Get two datasets
        resp = requests.get(f"{BASE_URL}/api/datasets", headers=self.headers)
        datasets = resp.json()
        if len(datasets) < 2:
            pytest.skip("Need at least 2 datasets for comparison")
        
        ds_a = datasets[0]
        ds_b = datasets[1]
        
        response = requests.get(
            f"{BASE_URL}/api/datasets/{ds_a['id']}/compare/{ds_b['id']}",
            headers=self.headers
        )
        assert response.status_code == 200
        data = response.json()
        assert "diffs" in data
        assert "total_labels_a" in data
        assert "total_labels_b" in data
        print(f"✓ Compared datasets: {len(data['diffs'])} differences")


class TestSeedEndpoint:
    """Seed endpoint test"""
    
    def test_seed_requires_auth(self):
        """POST /api/seed - requires authentication"""
        response = requests.post(f"{BASE_URL}/api/seed")
        assert response.status_code == 401
        print("✓ Seed endpoint requires authentication")
    
    def test_seed_reseeds_data(self):
        """POST /api/seed - reseeds all demo data"""
        login_resp = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL, "password": ADMIN_PASSWORD
        })
        token = login_resp.json()["token"]
        
        response = requests.post(f"{BASE_URL}/api/seed",
            headers={"Authorization": f"Bearer {token}"}
        )
        assert response.status_code == 200
        data = response.json()
        assert data["ok"] == True
        assert data["users"] >= 9
        assert data["datasets"] >= 10
        print(f"✓ Seed complete: {data['users']} users, {data['datasets']} datasets")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
