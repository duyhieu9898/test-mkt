
# learning_memory_system.md

# Learning Memory System

## Purpose
The Learning Memory System stores and tracks everything a child learns on the platform.
It acts as the long‑term learning memory that powers adaptive learning, mission generation, and personalized feedback.

Instead of lessons being isolated sessions, the system remembers:
- vocabulary mastery
- pronunciation progress
- skill development
- preferred mission types
- confidence patterns

This data becomes the foundation for personalized learning paths.

---

# 1. Core Concept

Every interaction a student has with the platform is recorded and used to update their learning memory.

Example flow:

Student completes mission
↓
Vocabulary and skill data updated
↓
Learning memory updated
↓
Next mission generated based on memory

---

# 2. Student Learning Profile

Each student has a persistent learning profile.

Example:

{
  "student_id": "uuid",
  "age": 6,
  "vocabulary_mastered": 120,
  "speaking_confidence": 0.72,
  "listening_skill": 0.81,
  "reading_skill": 0.60,
  "pronunciation_skill": 0.66,
  "favorite_mission_types": ["drawing","story"],
  "weak_skills": ["pronunciation"]
}

---

# 3. Vocabulary Memory Tracking

The system tracks every word encountered by a student.

Example record:

{
  "word": "rocket",
  "times_seen": 6,
  "times_correct": 5,
  "pronunciation_score": 0.78,
  "mastery_level": 0.83,
  "last_seen": "timestamp",
  "next_review": "timestamp"
}

Mastery increases through repeated successful exposure.

---

# 4. Skill Memory Tracking

Each learning activity updates skill scores.

Skills tracked:

- Vocabulary
- Listening
- Speaking
- Reading
- Pronunciation
- Grammar

Example:

{
 "speaking": 0.74,
 "listening": 0.81,
 "reading": 0.60,
 "pronunciation": 0.66
}

These scores evolve continuously.

---

# 5. Pronunciation Memory

The system records phoneme‑level performance.

Example:

{
 "phoneme": "r",
 "accuracy": 0.55,
 "attempts": 12,
 "trend": "improving"
}

Weak phonemes trigger targeted pronunciation missions.

---

# 6. Mission Preference Tracking

Children learn differently.

The system tracks engagement per mission type.

Example:

{
 "drawing": 0.90,
 "story": 0.85,
 "conversation": 0.70,
 "puzzle": 0.60
}

Future missions prioritize high‑engagement formats.

---

# 7. Learning History

Every mission attempt is stored.

Example:

{
 "mission_id": "uuid",
 "mission_type": "drawing",
 "completion_time": 120,
 "accuracy": 0.92,
 "engagement_score": 0.88
}

Learning history helps AI detect patterns.

---

# 8. Memory Update Pipeline

Student action
↓
Activity result recorded
↓
Vocabulary memory updated
↓
Skill scores updated
↓
Pronunciation memory updated
↓
Learning profile refreshed

---

# 9. Adaptive Mission Generation

The mission generator reads the learning memory.

Example:

If:
- vocabulary mastery low
- pronunciation weak

Next mission:
Pronunciation practice + flashcard mission

If:
- high mastery
- high engagement

Next mission:
Story mission with harder vocabulary

---

# 10. Teacher Insight

Teachers can see summarized learning memory.

Example dashboard:

Student: Minh

Vocabulary Mastery: 78%
Pronunciation: 65%
Speaking Confidence: 72%

Weak Words:
planet
astronaut

Recommendation:
Assign pronunciation practice.

---

# 11. Benefits

Personalized learning
Long‑term knowledge tracking
Better adaptive lessons
Improved student engagement
Clear teacher insight

The Learning Memory System acts as the core intelligence layer of the platform.
