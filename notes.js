// ================================================
// notes.js — All Notes & Chapters API Functions
// Place this file alongside your HTML files
// Import in both student-dashboard.html and admin.html
// ================================================

import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm'

// ⚠️ Replace YOUR_ANON_KEY_HERE with your real anon key
const supabase = createClient(
  'https://tnuztjayhzkrjhxjtgkf.supabase.co',
  'YOUR_ANON_KEY_HERE'
)

// ================================================
// CLEAN CONTENT - Remove admin UI elements from saved content
// ================================================
function cleanAdminContent(html) {
    if (!html || typeof html !== 'string') return html || '';
    
    let cleaned = html;
    
    // Remove all dragger elements
    cleaned = cleaned.replace(/<div\s+class="wle-col-dragger"[^>]*><\/div>/gi, '');
    cleaned = cleaned.replace(/<div\s+class="wle-row-dragger"[^>]*><\/div>/gi, '');
    cleaned = cleaned.replace(/<div\s+class="wle-handle"[^>]*><\/div>/gi, '');
    cleaned = cleaned.replace(/<span\s+class="wle-handle"[^>]*><\/span>/gi, '');
    
    // Remove toolbars
    cleaned = cleaned.replace(/<div\s+class="wle-table-toolbar"[^>]*>[\s\S]*?<\/div>/gi, '');
    cleaned = cleaned.replace(/<div\s+class="wle-img-toolbar"[^>]*>[\s\S]*?<\/div>/gi, '');
    
    // Remove contenteditable attributes
    cleaned = cleaned.replace(/contenteditable="[^"]*"/gi, '');
    
    // Remove admin-specific classes
    cleaned = cleaned.replace(/\s*class="[^"]*wle-[^"]*"/gi, '');
    cleaned = cleaned.replace(/\s*class="wle-[^"]*"/gi, '');
    
    // Remove wrapper divs but keep inner content
    cleaned = cleaned.replace(/<div\s+class="wle-table-wrap"[^>]*>/gi, '');
    cleaned = cleaned.replace(/<div\s+class="wle-img-wrap"[^>]*>/gi, '');
    cleaned = cleaned.replace(/<\/div>\s*(?=<table|<img)/gi, '');
    
    // Remove resize handles
    cleaned = cleaned.replace(/<span\s+class="wle-handle[^>]*><\/span>/gi, '');
    cleaned = cleaned.replace(/data-dir="[^"]*"/gi, '');
    
    return cleaned;
}
// ================================================
// GET /api/courses/:id/chapters
// Get ALL chapters for a specific course
// Used in: student notes reader + admin chapter list
// ================================================
export async function getChaptersByCourse(courseId) {
  const { data, error } = await supabase
    .from('chapters')
    .select(`
      id,
      title,
      description,
      order_num,
      topics (
        id,
        title,
        order_num,
        duration
      )
    `)
    .eq('course_id', courseId)
    .order('order_num', { ascending: true })

  if (error) {
    console.error('❌ getChaptersByCourse:', error.message)
    return []
  }

  // Sort topics inside each chapter by order_num
  return data.map(chapter => ({
    ...chapter,
    topics: (chapter.topics || []).sort((a, b) => a.order_num - b.order_num)
  }))
}

// ================================================
// GET /api/chapters/:id/topics
// Get ALL topics inside one specific chapter
// Includes full content for the notes reader
// ================================================
export async function getTopicsByChapter(chapterId) {
  const { data, error } = await supabase
    .from('topics')
    .select('*')
    .eq('chapter_id', chapterId)
    .order('order_num', { ascending: true })

  if (error) {
    console.error('❌ getTopicsByChapter:', error.message)
    return []
  }
  
  // Clean content for each topic
  if (data && data.length > 0) {
    data.forEach(topic => {
      if (topic.content) {
        topic.content = cleanAdminContent(topic.content)
      }
    })
  }
  
  return data
}
// ================================================
// GET single topic full content
// Get ONE topic with its full content to display
// ================================================
export async function getTopicById(topicId) {
  const { data, error } = await supabase
    .from('topics')
    .select('*')
    .eq('id', topicId)
    .maybeSingle()

  if (error) {
    console.error('❌ getTopicById:', error.message)
    return null
  }
  
  // Clean the content before returning
  if (data && data.content) {
    data.content = cleanAdminContent(data.content)
  }
  
  return data
}
// ================================================
// POST /api/courses/:id/chapters — ADMIN ONLY
// Create a new chapter WITH its topics all at once
// ================================================
export async function createChapterWithTopics(courseId, chapterData, topicsArray) {
  // chapterData = { title, description, order_num }
  // topicsArray = [{ title, content, video_url, order_num, duration }, ...]

  // Step 1: Create the chapter
  const { data: chapter, error: chapterError } = await supabase
    .from('chapters')
    .insert({
      course_id:   courseId,
      title:       chapterData.title,
      description: chapterData.description || '',
      order_num:   chapterData.order_num   || 1
    })
    .select()
     .maybeSingle()

  if (chapterError) {
    console.error('❌ createChapter:', chapterError.message)
    return { success: false, error: chapterError.message }
  }

  // Step 2: Create all topics linked to that chapter
  if (topicsArray && topicsArray.length > 0) {
    const topicsToInsert = topicsArray.map((topic, index) => ({
      chapter_id: chapter.id,
      course_id:  courseId,
      title:      topic.title,
      content:    topic.content    || '',
      video_url:  topic.video_url  || null,
      file_url:   topic.file_url   || null,
      duration:   topic.duration   || null,
      order_num:  topic.order_num  || index + 1
    }))

    const { error: topicsError } = await supabase
      .from('topics')
      .insert(topicsToInsert)

    if (topicsError) {
      console.error('❌ createTopics:', topicsError.message)
      return { success: false, error: topicsError.message }
    }
  }

  return { success: true, chapter }
}

// ================================================
// POST — Add a single topic to existing chapter
// Admin adds one topic at a time
// ================================================
export async function addTopicToChapter(chapterId, courseId, topicData) {
  // topicData = { title, content, video_url, order_num, duration }

  const { data, error } = await supabase
    .from('topics')
    .insert({
      chapter_id: chapterId,
      course_id:  courseId,
      title:      topicData.title,
      content:    topicData.content   || '',
      video_url:  topicData.video_url || null,
      file_url:   topicData.file_url  || null,
      duration:   topicData.duration  || null,
      order_num:  topicData.order_num || 1
    })
    .select()
     .maybeSingle()

  if (error) {
    console.error('❌ addTopicToChapter:', error.message)
    return { success: false, error: error.message }
  }
  return { success: true, topic: data }
}

// ================================================
// PUT /api/chapters/:id — ADMIN ONLY
// Edit an existing chapter title/description
// ================================================
export async function updateChapter(chapterId, updates) {
  // updates = { title, description, order_num }

  const { data, error } = await supabase
    .from('chapters')
    .update({
      ...updates,
      updated_at: new Date().toISOString()
    })
    .eq('id', chapterId)
    .select()
    .maybeSingle()

  if (error) {
    console.error('❌ updateChapter:', error.message)
    return { success: false, error: error.message }
  }
  return { success: true, chapter: data }
}

// ================================================
// PUT — Edit a single topic content
// Admin updates topic title, content, video
// ================================================
export async function updateTopic(topicId, updates) {
  // updates = { title, content, video_url, file_url, duration, order_num }

  const { data, error } = await supabase
    .from('topics')
    .update({
      ...updates,
      updated_at: new Date().toISOString()
    })
    .eq('id', topicId)
    .select()
    .maybeSingle()

  if (error) {
    console.error('❌ updateTopic:', error.message)
    return { success: false, error: error.message }
  }
  return { success: true, topic: data }
}

// ================================================
// DELETE /api/chapters/:id — ADMIN ONLY
// Delete a chapter AND all its topics (cascade)
// ================================================
export async function deleteChapter(chapterId) {
  // Topics are deleted automatically via ON DELETE CASCADE
  const { error } = await supabase
    .from('chapters')
    .delete()
    .eq('id', chapterId)

  if (error) {
    console.error('❌ deleteChapter:', error.message)
    return { success: false, error: error.message }
  }
  return { success: true }
}

// ================================================
// DELETE — Delete a single topic
// ================================================
export async function deleteTopic(topicId) {
  const { error } = await supabase
    .from('topics')
    .delete()
    .eq('id', topicId)

  if (error) {
    console.error('❌ deleteTopic:', error.message)
    return { success: false, error: error.message }
  }
  return { success: true }
}

// ================================================
// POST /api/topics/:id/complete
// Student marks a topic as READ/COMPLETE
// ================================================
export async function markTopicComplete(topicId, courseId) {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return { success: false, error: 'Not logged in' }

  // Check if already completed
  const { data: existing } = await supabase
    .from('topic_completions')
    .select('id')
    .eq('student_id', session.user.id)
    .eq('topic_id', topicId)
    .maybeSingle()

  // If already marked — skip (idempotent)
  if (existing) return { success: true, alreadyDone: true }

  const { error } = await supabase
    .from('topic_completions')
    .insert({
      user_id: session.user.id,
      topic_id:   topicId,
      course_id:  courseId
    })

  if (error) {
    console.error('❌ markTopicComplete:', error.message)
    return { success: false, error: error.message }
  }

  return { success: true }
}

// ================================================
// POST — Un-mark a topic (student un-checks it)
// ================================================
export async function unmarkTopicComplete(topicId) {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return

  const { error } = await supabase
    .from('topic_completions')
    .delete()
    .eq('student_id', session.user.id)
    .eq('topic_id', topicId)

  if (error) console.error('❌ unmarkTopicComplete:', error.message)
}

// ================================================
// GET /api/students/:id/notes-progress
// Get reading progress for a student per course
// Returns: { courseId, totalTopics, completedTopics, percent }
// ================================================
export async function getNotesProgress(courseId) {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return null

  // Get total topics in this course
  const { data: allTopics, error: topicsError } = await supabase
    .from('topics')
    .select('id')
    .eq('course_id', courseId)

  if (topicsError) {
    console.error('❌ getNotesProgress (topics):', topicsError.message)
    return null
  }

  // Get topics this student has completed in this course
  const { data: completed, error: completedError } = await supabase
    .from('topic_completions')
    .select('topic_id')
    .eq('student_id', session.user.id)
    .eq('course_id', courseId)

  if (completedError) {
    console.error('❌ getNotesProgress (completions):', completedError.message)
    return null
  }

  const totalTopics     = allTopics?.length     || 0
  const completedTopics = completed?.length      || 0
  const percent         = totalTopics > 0
    ? Math.round((completedTopics / totalTopics) * 100)
    : 0

  return {
    courseId,
    totalTopics,
    completedTopics,
    percent,
    completedTopicIds: (completed || []).map(c => c.topic_id)
  }
}

// ================================================
// GET progress across ALL enrolled courses
// Used in student dashboard overview/stats
// ================================================
export async function getAllCoursesProgress() {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return []

  const { data, error } = await supabase
    .from('topic_completions')
    .select('course_id, topic_id')
    .eq('student_id', session.user.id)

  if (error) {
    console.error('❌ getAllCoursesProgress:', error.message)
    return []
  }

  // Group by course_id
  const grouped = {}
  data.forEach(row => {
    if (!grouped[row.course_id]) grouped[row.course_id] = 0
    grouped[row.course_id]++
  })

  return grouped // { courseId: completedCount, ... }
}
// ================================================
// GET /api/enrollments - Get all enrollments
// Used by admin dashboard when publishing notes
// ================================================
export async function getEnrollments(filters = {}) {
  try {
    let query = supabase
      .from('enrollments')
      .select(`
        *,
        profiles:user_id (
          id,
          email,
          full_name
        ),
        courses:course_id (
          id,
          title
        )
      `);

    // Apply filters
    if (filters.course_id) {
      query = query.eq('course_id', filters.course_id);
    }
    if (filters.user_id) {
      query = query.eq('user_id', filters.user_id);
    }
    if (filters.status) {
      query = query.eq('status', filters.status);
    }

    const { data, error } = await query;

    if (error) {
      // Check if table doesn't exist (error code 42P01)
      if (error.code === '42P01') {
        console.warn('⚠️ Enrollments table does not exist yet. Please run the SQL setup.');
        return { data: [], error: null };
      }
      console.error('❌ getEnrollments error:', error.message);
      return { data: [], error };
    }

    return { data, error: null };
  } catch (err) {
    console.error('❌ getEnrollments exception:', err.message);
    return { data: [], error: err };
  }
}

// ================================================
// GET /api/courses/:id/enrollments
// Get all students enrolled in a specific course
// Used when publishing notes to notify students
// ================================================
export async function getCourseEnrollments(courseId) {
  try {
    const { data, error } = await supabase
      .from('enrollments')
      .select(`
        user_id,
        enrolled_at,
        status,
        progress,
        profiles:user_id (
          id,
          email,
          full_name
        )
      `)
      .eq('course_id', courseId)
      .eq('status', 'active');

    if (error) {
      if (error.code === '42P01') {
        console.warn('⚠️ Enrollments table not set up yet');
        return { data: [], error: null };
      }
      throw error;
    }

    return { data, error: null };
  } catch (error) {
    console.error('❌ getCourseEnrollments:', error.message);
    return { data: [], error };
  }
}

// ================================================
// POST /api/enrollments - Enroll a student in a course
// Used when admin adds a user to a course
// ================================================
export async function enrollStudent(userId, courseId) {
  try {
    // Check if already enrolled
    const { data: existing } = await supabase
      .from('enrollments')
      .select('id')
      .eq('user_id', userId)
      .eq('course_id', courseId)
      .maybeSingle();

    if (existing) {
      return { success: true, message: 'Already enrolled' };
    }

    const { data, error } = await supabase
      .from('enrollments')
      .insert({
        user_id: userId,
        course_id: courseId,
        enrolled_at: new Date().toISOString(),
        status: 'active',
        progress: 0
      })
      .select()
      .maybeSingle();

    if (error) {
      if (error.code === '42P01') {
        console.warn('⚠️ Enrollments table not set up yet');
        return { success: false, error: 'Enrollments feature not configured' };
      }
      throw error;
    }

    return { success: true, data };
  } catch (error) {
    console.error('❌ enrollStudent:', error.message);
    return { success: false, error: error.message };
  }
}

// ================================================
// PUT /api/enrollments/:id - Update enrollment
// Update progress or status
// ================================================
export async function updateEnrollment(enrollmentId, updates) {
  try {
    const { data, error } = await supabase
      .from('enrollments')
      .update({
        ...updates,
        updated_at: new Date().toISOString()
      })
      .eq('id', enrollmentId)
      .select()
      .maybeSingle();

    if (error) {
      if (error.code === '42P01') {
        return { success: false, error: 'Enrollments table not found' };
      }
      throw error;
    }

    return { success: true, data };
  } catch (error) {
    console.error('❌ updateEnrollment:', error.message);
    return { success: false, error: error.message };
  }
}

// ================================================
// DELETE /api/enrollments/:id - Remove enrollment
// Used when admin removes student from course
// ================================================
export async function removeEnrollment(enrollmentId) {
  try {
    const { error } = await supabase
      .from('enrollments')
      .delete()
      .eq('id', enrollmentId);

    if (error) {
      if (error.code === '42P01') {
        return { success: false, error: 'Enrollments table not found' };
      }
      throw error;
    }

    return { success: true };
  } catch (error) {
    console.error('❌ removeEnrollment:', error.message);
    return { success: false, error: error.message };
  }
}

// ================================================
// GET /api/students/:id/enrollments
// Get all courses a student is enrolled in
// Used in student dashboard
// ================================================
export async function getStudentEnrollments(userId) {
  try {
    const { data, error } = await supabase
      .from('enrollments')
      .select(`
        course_id,
        enrolled_at,
        status,
        progress,
        courses:course_id (
          id,
          title,
          description
        )
      `)
      .eq('user_id', userId);

    if (error) {
      if (error.code === '42P01') {
        console.warn('⚠️ Enrollments table not set up yet');
        return { data: [], error: null };
      }
      throw error;
    }

    return { data, error: null };
  } catch (error) {
    console.error('❌ getStudentEnrollments:', error.message);
    return { data: [], error };
  }
}

// ================================================
// POST /api/enrollments/bulk - Bulk enroll students
// Used when admin adds multiple students to a course
// ================================================
export async function bulkEnrollStudents(userIds, courseId) {
  try {
    const enrollments = userIds.map(userId => ({
      user_id: userId,
      course_id: courseId,
      enrolled_at: new Date().toISOString(),
      status: 'active',
      progress: 0
    }));

    const { data, error } = await supabase
      .from('enrollments')
      .insert(enrollments)
      .select();

    if (error) {
      if (error.code === '42P01') {
        return { success: false, error: 'Enrollments table not found' };
      }
      throw error;
    }

    return { success: true, data };
  } catch (error) {
    console.error('❌ bulkEnrollStudents:', error.message);
    return { success: false, error: error.message };
  }
}