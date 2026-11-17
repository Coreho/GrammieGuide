---
id: TASK-86
title: Family photo upload page with caregiver approval
status: To Do
assignee: []
created_date: '2026-11-15 05:43'
labels:
  - photos
  - family
  - feature
milestone: m-13
dependencies: []
priority: low
ordinal: 82000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Family members far away would like to share photos with her, but every photo currently goes through the caregiver's own computer import. A private page where family can upload a photo with a caption, which then waits in admin for approval before she ever sees it, lets more people contribute while the caregiver stays in control. This needs a small server piece (the owner runs koreokorp.com), so where photos are stored, for how long, and how family links are shared and revoked must be decided at the start; uploads hold photos of family, so they are private data.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Each family member gets a private upload link the caregiver can create and revoke from admin
- [ ] #2 Uploaded photos and captions wait in admin's Photos tab as pending; nothing is shown to her until the caregiver approves it
- [ ] #3 Approved photos go through the existing photo pipeline (resize, thumbnail, library) and appear like imported photos
- [ ] #4 Rejected and approved photos are deleted from the server, and the server keeps nothing longer than a set time
- [ ] #5 Only images within size and type limits are accepted, and her computer checks every downloaded file again before importing it
- [ ] #6 The hosting and retention decision is recorded in the task before building
<!-- AC:END -->
