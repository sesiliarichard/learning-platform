// ============================================
// analytics.js — Admin Analytics Backend
// Covers all 4 analytics endpoints
// Admin-only — aggregates data from all tables
// Place in same folder as other JS files
// ============================================

// ─────────────────────────────────────────────
// 1. GET /api/analytics/overview
// Get high-level overview stats for admin dashboard
// Total counts of users, courses, enrollments, etc.
// ─────────────────────────────────────────────
async function getAnalyticsOverview() {
    try {
        const { data: { user } } = await supabaseClient.auth.getUser();
        if (!user) throw new Error('Not authenticated');

        // Check if admin
        const { data: profile } = await supabaseClient
            .from('profiles')
            .select('role')
            .eq('id', user.id)
            .maybeSingle();

        if (profile?.role !== 'admin') {
            throw new Error('Admin access required');
        }

        // Get all counts in parallel for speed
        const [
            totalUsers,
            totalCourses,
            totalEnrollments,
            activeSessions,
            totalDiscussions,
            totalRecordings
        ] = await Promise.all([
            // Total users (students + instructors)
            supabaseClient
                .from('profiles')
                .select('*', { count: 'exact', head: true }),
            
            // Total courses
            supabaseClient
                .from('courses')
                .select('*', { count: 'exact', head: true })
                .eq('status', 'active'),
            
            // Total enrollments
            supabaseClient
                .from('enrollments')
                .select('*', { count: 'exact', head: true }),
            
            // Active live sessions
            supabaseClient
                .from('sessions')
                .select('*', { count: 'exact', head: true })
                .eq('status', 'live'),
            
            // Total discussion threads
            supabaseClient
                .from('discussion_threads')
                .select('*', { count: 'exact', head: true }),
            
            // Total published recordings
            supabaseClient
                .from('recordings')
                .select('*', { count: 'exact', head: true })
                .eq('is_published', true)
        ]);

        // Get students count specifically
        const { count: studentsCount } = await supabaseClient
            .from('profiles')
            .select('*', { count: 'exact', head: true })
            .eq('role', 'student');

        // Get completed courses count
        const { count: completedCount } = await supabaseClient
            .from('enrollments')
            .select('*', { count: 'exact', head: true })
            .gte('progress', 100);

        // Calculate average progress across all enrollments
        const { data: allEnrollments } = await supabaseClient
            .from('enrollments')
            .select('progress');

        const avgProgress = allEnrollments && allEnrollments.length > 0
            ? Math.round(
                allEnrollments.reduce((sum, e) => sum + (e.progress || 0), 0) / allEnrollments.length
              )
            : 0;

        return {
            success: true,
            overview: {
                totalUsers:        totalUsers.count || 0,
                totalStudents:     studentsCount || 0,
                totalCourses:      totalCourses.count || 0,
                totalEnrollments:  totalEnrollments.count || 0,
                completedCourses:  completedCount || 0,
                activeSessions:    activeSessions.count || 0,
                totalDiscussions:  totalDiscussions.count || 0,
                totalRecordings:   totalRecordings.count || 0,
                averageProgress:   avgProgress
            }
        };

    } catch (error) {
        console.error('❌ getAnalyticsOverview error:', error.message);
        return { success: false, error: error.message };
    }
}

// ─────────────────────────────────────────────
// 2. GET /api/analytics/students
// Get detailed student activity and progress stats
// Includes top performers, recent enrollments, etc.
// ─────────────────────────────────────────────
async function getStudentAnalytics() {
    try {
        const { data: { user } } = await supabaseClient.auth.getUser();
        if (!user) throw new Error('Not authenticated');

        // Get all students with their enrollment data
        const { data: students, error: studentsError } = await supabaseClient
            .from('profiles')
            .select(`
                id,
                first_name,
                last_name,
                email,
                country,
                created_at,
                enrollments (
                    id,
                    progress,
                    completed_at,
                    courses (
                        title
                    )
                )
            `)
            .eq('role', 'student')
            .order('created_at', { ascending: false });

        if (studentsError) throw studentsError;

        // Process student data
        const studentStats = (students || []).map(student => {
            const enrollments = student.enrollments || [];
            const completedCourses = enrollments.filter(e => e.progress >= 100).length;
            const avgProgress = enrollments.length > 0
                ? Math.round(
                    enrollments.reduce((sum, e) => sum + (e.progress || 0), 0) / enrollments.length
                  )
                : 0;

            return {
                id:                student.id,
                name:              `${student.first_name} ${student.last_name}`,
                email:             student.email,
                country:           student.country,
                joinedAt:          student.created_at,
                totalEnrollments:  enrollments.length,
                completedCourses:  completedCourses,
                averageProgress:   avgProgress,
                inProgressCourses: enrollments.length - completedCourses
            };
        });

        // Sort by performance (completed courses, then avg progress)
        const topPerformers = [...studentStats]
            .sort((a, b) => {
                if (b.completedCourses !== a.completedCourses) {
                    return b.completedCourses - a.completedCourses;
                }
                return b.averageProgress - a.averageProgress;
            })
            .slice(0, 10);

        // Recent enrollments (last 30 days)
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        const recentStudents = studentStats.filter(s => 
            new Date(s.joinedAt) > thirtyDaysAgo
        );

        // Country distribution
        const countryStats = {};
        studentStats.forEach(s => {
            const country = s.country || 'Unknown';
            countryStats[country] = (countryStats[country] || 0) + 1;
        });

        const topCountries = Object.entries(countryStats)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .map(([country, count]) => ({ country, count }));

        return {
            success: true,
            analytics: {
                totalStudents:         studentStats.length,
                activeStudents:        studentStats.filter(s => s.totalEnrollments > 0).length,
                averageEnrollments:    studentStats.length > 0 
                    ? (studentStats.reduce((sum, s) => sum + s.totalEnrollments, 0) / studentStats.length).toFixed(1)
                    : 0,
                topPerformers:         topPerformers,
                recentStudents:        recentStudents.length,
                topCountries:          topCountries,
                allStudents:           studentStats
            }
        };

    } catch (error) {
        console.error('❌ getStudentAnalytics error:', error.message);
        return { success: false, error: error.message };
    }
}

// ─────────────────────────────────────────────
// 3. GET /api/analytics/certificates
// Get certificate issuance statistics
// Note: This assumes certificates table exists
// ─────────────────────────────────────────────
async function getCertificateAnalytics() {
    try {
        const { data: { user } } = await supabaseClient.auth.getUser();
        if (!user) throw new Error('Not authenticated');

        // Check if certificates table exists
        const { data: certificates, error: certsError } = await supabaseClient
            .from('certificates')
            .select(`
                id,
                user_id,
                course_id,
                issued_at,
                courses (
                    title,
                    thumbnail_color
                ),
                profiles (
                    first_name,
                    last_name
                )
            `)
            .order('issued_at', { ascending: false });

        if (certsError) {
            // Table might not exist yet
            console.warn('Certificates table not found:', certsError.message);
            return {
                success: true,
                analytics: {
                    totalCertificates: 0,
                    recentCertificates: [],
                    certificatesByCourse: [],
                    thisMonth: 0,
                    thisWeek: 0
                }
            };
        }

        // Total certificates issued
        const totalCertificates = certificates?.length || 0;

        // Certificates issued this month
        const thisMonthStart = new Date();
        thisMonthStart.setDate(1);
        thisMonthStart.setHours(0, 0, 0, 0);

        const thisMonthCerts = (certificates || []).filter(c => 
            new Date(c.issued_at) >= thisMonthStart
        ).length;

        // Certificates issued this week
        const thisWeekStart = new Date();
        thisWeekStart.setDate(thisWeekStart.getDate() - thisWeekStart.getDay());
        thisWeekStart.setHours(0, 0, 0, 0);

        const thisWeekCerts = (certificates || []).filter(c => 
            new Date(c.issued_at) >= thisWeekStart
        ).length;

        // Certificates by course
        const byCourse = {};
        (certificates || []).forEach(cert => {
            const courseTitle = cert.courses?.title || 'Unknown Course';
            if (!byCourse[courseTitle]) {
                byCourse[courseTitle] = {
                    title: courseTitle,
                    count: 0,
                    color: cert.courses?.thumbnail_color || 'purple'
                };
            }
            byCourse[courseTitle].count++;
        });

        const certificatesByCourse = Object.values(byCourse)
            .sort((a, b) => b.count - a.count);

        // Recent certificates (last 10)
        const recentCertificates = (certificates || [])
            .slice(0, 10)
            .map(cert => ({
                id:          cert.id,
                studentName: `${cert.profiles?.first_name || ''} ${cert.profiles?.last_name || ''}`.trim(),
                courseTitle: cert.courses?.title || 'Unknown',
                issuedAt:    cert.issued_at
            }));

        return {
            success: true,
            analytics: {
                totalCertificates,
                thisMonth:           thisMonthCerts,
                thisWeek:            thisWeekCerts,
                recentCertificates,
                certificatesByCourse
            }
        };

    } catch (error) {
        console.error('❌ getCertificateAnalytics error:', error.message);
        return { success: false, error: error.message };
    }
}

// ─────────────────────────────────────────────
// 4. GET /api/analytics/sessions
// Get live session attendance and recording stats
// ─────────────────────────────────────────────
async function getSessionAnalytics() {
    try {
        const { data: { user } } = await supabaseClient.auth.getUser();
        if (!user) throw new Error('Not authenticated');

        // Get all sessions (live, scheduled, ended)
        const { data: sessions, error: sessionsError } = await supabaseClient
            .from('sessions')
            .select(`
                id,
                title,
                status,
                started_at,
                ended_at,
                duration_mins,
                courses (
                    title
                )
            `)
            .order('started_at', { ascending: false });

        if (sessionsError) throw sessionsError;

        // Count by status
        const statusCounts = {
            live:      (sessions || []).filter(s => s.status === 'live').length,
            scheduled: (sessions || []).filter(s => s.status === 'scheduled').length,
            ended:     (sessions || []).filter(s => s.status === 'ended').length
        };

        // Get participant counts for each session
        const sessionsWithParticipants = await Promise.all(
            (sessions || []).map(async (session) => {
                const { count } = await supabaseClient
                    .from('session_participants')
                    .select('*', { count: 'exact', head: true })
                    .eq('session_id', session.id);

                return {
                    id:              session.id,
                    title:           session.title,
                    courseTitle:     session.courses?.title || 'Unknown',
                    status:          session.status,
                    startedAt:       session.started_at,
                    endedAt:         session.ended_at,
                    durationMins:    session.duration_mins || 0,
                    participantCount: count || 0
                };
            })
        );

        // Sort by participant count (most attended sessions)
        const topSessions = [...sessionsWithParticipants]
            .filter(s => s.status === 'ended')
            .sort((a, b) => b.participantCount - a.participantCount)
            .slice(0, 10);

        // Total session time (hours)
        const totalMinutes = sessionsWithParticipants
            .filter(s => s.status === 'ended')
            .reduce((sum, s) => sum + (s.durationMins || 0), 0);
        const totalHours = (totalMinutes / 60).toFixed(1);

        // Average attendance
        const endedSessions = sessionsWithParticipants.filter(s => s.status === 'ended');
        const avgAttendance = endedSessions.length > 0
            ? Math.round(
                endedSessions.reduce((sum, s) => sum + s.participantCount, 0) / endedSessions.length
              )
            : 0;

        // Get recordings stats
        const { data: recordings } = await supabaseClient
            .from('recordings')
            .select('id, views_count, duration_mins, is_published');

        const recordingsStats = {
            total:         recordings?.length || 0,
            published:     (recordings || []).filter(r => r.is_published).length,
            totalViews:    (recordings || []).reduce((sum, r) => sum + (r.views_count || 0), 0),
            totalDuration: Math.round((recordings || []).reduce((sum, r) => sum + (r.duration_mins || 0), 0) / 60)
        };

        return {
            success: true,
            analytics: {
                totalSessions:     sessions?.length || 0,
                statusCounts,
                totalSessionHours: totalHours,
                averageAttendance: avgAttendance,
                topSessions,
                recentSessions:    sessionsWithParticipants.slice(0, 10),
                recordings:        recordingsStats
            }
        };

    } catch (error) {
        console.error('❌ getSessionAnalytics error:', error.message);
        return { success: false, error: error.message };
    }
}

// ─────────────────────────────────────────────
// BONUS: GET COURSE PERFORMANCE
// Which courses have the highest completion rates
// ─────────────────────────────────────────────
async function getCoursePerformance() {
    try {
        const { data: courses, error } = await supabaseClient
            .from('courses')
            .select(`
                id,
                title,
                thumbnail_color,
                enrollments (
                    progress,
                    completed_at
                )
            `)
            .eq('status', 'active');

        if (error) throw error;

        const courseStats = (courses || []).map(course => {
            const enrollments = course.enrollments || [];
            const totalEnrollments = enrollments.length;
            const completedCount = enrollments.filter(e => e.progress >= 100).length;
            const completionRate = totalEnrollments > 0
                ? Math.round((completedCount / totalEnrollments) * 100)
                : 0;
            const avgProgress = totalEnrollments > 0
                ? Math.round(
                    enrollments.reduce((sum, e) => sum + (e.progress || 0), 0) / totalEnrollments
                  )
                : 0;

            return {
                id:               course.id,
                title:            course.title,
                color:            course.thumbnail_color,
                totalEnrollments: totalEnrollments,
                completedCount:   completedCount,
                completionRate:   completionRate,
                averageProgress:  avgProgress
            };
        });

        // Sort by completion rate
        courseStats.sort((a, b) => b.completionRate - a.completionRate);

        return {
            success: true,
            courses: courseStats
        };

    } catch (error) {
        console.error('❌ getCoursePerformance error:', error.message);
        return { success: false, error: error.message, courses: [] };
    }
}

// ─────────────────────────────────────────────
// BONUS: GET ENGAGEMENT TRENDS
// Activity over time (last 30 days)
// ─────────────────────────────────────────────
async function getEngagementTrends() {
    try {
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        const thirtyDaysAgoISO = thirtyDaysAgo.toISOString();

        // New enrollments per day (last 30 days)
        const { data: enrollments } = await supabaseClient
            .from('enrollments')
            .select('enrolled_at')
            .gte('enrolled_at', thirtyDaysAgoISO);

        // New discussion threads per day
        const { data: discussions } = await supabaseClient
            .from('discussion_threads')
            .select('created_at')
            .gte('created_at', thirtyDaysAgoISO);

        // New users per day
        const { data: users } = await supabaseClient
            .from('profiles')
            .select('created_at')
            .gte('created_at', thirtyDaysAgoISO);

        // Group by day
        const dailyData = {};
        for (let i = 0; i < 30; i++) {
            const date = new Date();
            date.setDate(date.getDate() - i);
            const dateKey = date.toISOString().split('T')[0];
            dailyData[dateKey] = { enrollments: 0, discussions: 0, newUsers: 0 };
        }

        (enrollments || []).forEach(e => {
            const date = e.enrolled_at.split('T')[0];
            if (dailyData[date]) dailyData[date].enrollments++;
        });

        (discussions || []).forEach(d => {
            const date = d.created_at.split('T')[0];
            if (dailyData[date]) dailyData[date].discussions++;
        });

        (users || []).forEach(u => {
            const date = u.created_at.split('T')[0];
            if (dailyData[date]) dailyData[date].newUsers++;
        });

        const trends = Object.entries(dailyData)
            .sort((a, b) => a[0].localeCompare(b[0]))
            .map(([date, data]) => ({ date, ...data }));

        return {
            success: true,
            trends
        };

    } catch (error) {
        console.error('❌ getEngagementTrends error:', error.message);
        return { success: false, error: error.message, trends: [] };
    }
}

console.log('✅ Analytics.js loaded');