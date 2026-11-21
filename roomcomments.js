/**
 * RecVerse Room Comments Service
 * Handles room reviews, comments, ratings
 */

const express = require('express');
const { query } = require('./database');
const { config } = require('./config');
const { getAuthedAccountId } = require('./shared');

const router = express.Router();

function unauthorized(res) {
  return res.status(401).send();
}

// ============================================================
// ROOM COMMENTS / REVIEWS
// ============================================================

// Get comments for room
router.get('/rooms/:roomId/comments', async (req, res) => {
  const roomId = req.params.roomId;
  const { limit = 20, offset = 0, sort = 'newest' } = req.query;

  let orderBy = 'created_at DESC';
  if (sort === 'oldest') orderBy = 'created_at ASC';
  else if (sort === 'top') orderBy = 'helpful_count DESC, created_at DESC';

  const result = await query(
    `SELECT c.*, a.username, a.displayName, a.profileImage
     FROM room_comment c
     JOIN account a ON c.account_id = a.account_id
     WHERE c.room_id = $1 AND c.parent_id IS NULL
     ORDER BY ${orderBy}
     LIMIT $2 OFFSET $3`,
    [roomId, parseInt(limit), parseInt(offset)]
  );

  const comments = result.rows.map(r => ({
    commentId: r.comment_id,
    roomId: r.room_id,
    accountId: r.account_id,
    username: r.username,
    displayName: r.displayName,
    profileImage: r.profileImage,
    content: r.content,
    rating: r.rating,
    helpfulCount: r.helpful_count,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    replies: [], // Would fetch replies separately
  }));

  // Get total count
  const countResult = await query(
    'SELECT COUNT(*) FROM room_comment WHERE room_id = $1 AND parent_id IS NULL',
    [roomId]
  );

  res.json({
    comments,
    total: parseInt(countResult.rows[0].count, 10),
    limit: parseInt(limit),
    offset: parseInt(offset),
  });
});

// Get comment with replies
router.get('/comments/:commentId', async (req, res) => {
  const commentId = req.params.commentId;

  const result = await query(
    `SELECT c.*, a.username, a.displayName, a.profileImage
     FROM room_comment c
     JOIN account a ON c.account_id = a.account_id
     WHERE c.comment_id = $1`,
    [commentId]
  );

  if (result.rows.length === 0) {
    return res.status(404).json({ error: 'Comment not found' });
  }

  const r = result.rows[0];

  // Get replies
  const repliesResult = await query(
    `SELECT c.*, a.username, a.displayName, a.profileImage
     FROM room_comment c
     JOIN account a ON c.account_id = a.account_id
     WHERE c.parent_id = $1
     ORDER BY c.created_at ASC`,
    [commentId]
  );

  const replies = repliesResult.rows.map(rr => ({
    commentId: rr.comment_id,
    roomId: rr.room_id,
    accountId: rr.account_id,
    username: rr.username,
    displayName: rr.displayName,
    profileImage: rr.profileImage,
    content: rr.content,
    rating: rr.rating,
    helpfulCount: rr.helpful_count,
    createdAt: rr.created_at,
    updatedAt: rr.updated_at,
  }));

  res.json({
    commentId: r.comment_id,
    roomId: r.room_id,
    accountId: r.account_id,
    username: r.username,
    displayName: r.displayName,
    profileImage: r.profileImage,
    content: r.content,
    rating: r.rating,
    helpfulCount: r.helpful_count,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    replies,
  });
});

// Post comment
router.post('/rooms/:roomId/comments', async (req, res) => {
  const accountId = getAuthedAccountId(req);
  if (!accountId) return unauthorized(res);

  const roomId = req.params.roomId;
  const { content, rating, parentId } = req.body;

  if (!content || content.trim().length === 0) {
    return res.status(400).json({ error: 'Comment content required' });
  }

  if (content.length > 2000) {
    return res.status(400).json({ error: 'Comment too long (max 2000 characters)' });
  }

  // Check if room exists
  const roomResult = await query('SELECT 1 FROM room WHERE room_id = $1', [roomId]);
  if (roomResult.rows.length === 0) {
    return res.status(404).json({ error: 'Room not found' });
  }

  // If replying, check parent exists
  if (parentId) {
    const parentResult = await query('SELECT 1 FROM room_comment WHERE comment_id = $1 AND room_id = $2', [parentId, roomId]);
    if (parentResult.rows.length === 0) {
      return res.status(404).json({ error: 'Parent comment not found' });
    }
  }

  // Check if user already reviewed this room (for top-level comments)
  if (!parentId) {
    const existing = await query(
      'SELECT 1 FROM room_comment WHERE room_id = $1 AND account_id = $2 AND parent_id IS NULL',
      [roomId, accountId]
    );
    if (existing.rows.length > 0) {
      return res.status(400).json({ error: 'You have already reviewed this room' });
    }
  }

  // Validate rating
  const ratingValue = rating !== undefined ? parseInt(rating, 10) : null;
  if (ratingValue !== null && (ratingValue < 1 || ratingValue > 5)) {
    return res.status(400).json({ error: 'Rating must be between 1 and 5' });
  }

  const commentId = generateId();
  await query(
    `INSERT INTO room_comment (comment_id, room_id, account_id, content, rating, parent_id, helpful_count, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, 0, NOW(), NOW())`,
    [commentId, roomId, accountId, content.trim(), ratingValue, parentId || null]
  );

  // If top-level comment with rating, update room rating aggregate
  if (!parentId && ratingValue !== null) {
    await updateRoomRating(roomId);
  }

  res.json({
    success: true,
    commentId,
    roomId,
    accountId,
    content: content.trim(),
    rating: ratingValue,
    parentId,
    helpfulCount: 0,
    createdAt: formatISO(),
  });
});

// Update comment
router.put('/comments/:commentId', async (req, res) => {
  const accountId = getAuthedAccountId(req);
  if (!accountId) return unauthorized(res);

  const commentId = req.params.commentId;
  const { content, rating } = req.body;

  if (!content || content.trim().length === 0) {
    return res.status(400).json({ error: 'Comment content required' });
  }

  if (content.length > 2000) {
    return res.status(400).json({ error: 'Comment too long' });
  }

  const result = await query(
    'SELECT * FROM room_comment WHERE comment_id = $1 AND account_id = $2',
    [commentId, accountId]
  );

  if (result.rows.length === 0) {
    return res.status(404).json({ error: 'Comment not found or not owner' });
  }

  const ratingValue = rating !== undefined ? parseInt(rating, 10) : null;
  if (ratingValue !== null && (ratingValue < 1 || ratingValue > 5)) {
    return res.status(400).json({ error: 'Rating must be between 1 and 5' });
  }

  await query(
    'UPDATE room_comment SET content = $1, rating = $2, updated_at = NOW() WHERE comment_id = $3',
    [content.trim(), ratingValue, commentId]
  );

  // Update room rating if top-level
  if (!result.rows[0].parent_id && ratingValue !== null) {
    await updateRoomRating(result.rows[0].room_id);
  }

  res.json({ success: true });
});

// Delete comment
router.delete('/comments/:commentId', async (req, res) => {
  const accountId = getAuthedAccountId(req);
  if (!accountId) return unauthorized(res);

  const commentId = req.params.commentId;

  const result = await query(
    'SELECT * FROM room_comment WHERE comment_id = $1 AND account_id = $2',
    [commentId, accountId]
  );

  if (result.rows.length === 0) {
    return res.status(404).json({ error: 'Comment not found or not owner' });
  }

  const comment = result.rows[0];

  // Delete comment and all replies
  await query('DELETE FROM room_comment WHERE comment_id = $1 OR parent_id = $1', [commentId]);

  // Update room rating if top-level
  if (!comment.parent_id && comment.rating !== null) {
    await updateRoomRating(comment.room_id);
  }

  res.json({ success: true });
});

// Mark comment helpful
router.post('/comments/:commentId/helpful', async (req, res) => {
  const accountId = getAuthedAccountId(req);
  if (!accountId) return unauthorized(res);

  const commentId = req.params.commentId;

  // Check if already marked helpful
  const existing = await query(
    'SELECT 1 FROM comment_helpful WHERE comment_id = $1 AND account_id = $2',
    [commentId, accountId]
  );

  if (existing.rows.length > 0) {
    return res.status(400).json({ error: 'Already marked helpful' });
  }

  await query(
    'INSERT INTO comment_helpful (comment_id, account_id, created_at) VALUES ($1, $2, NOW())',
    [commentId, accountId]
  );

  await query(
    'UPDATE room_comment SET helpful_count = helpful_count + 1 WHERE comment_id = $1',
    [commentId]
  );

  res.json({ success: true });
});

// Remove helpful mark
router.delete('/comments/:commentId/helpful', async (req, res) => {
  const accountId = getAuthedAccountId(req);
  if (!accountId) return unauthorized(res);

  const commentId = req.params.commentId;

  const result = await query(
    'DELETE FROM comment_helpful WHERE comment_id = $1 AND account_id = $2',
    [commentId, accountId]
  );

  if (result.rowCount > 0) {
    await query(
      'UPDATE room_comment SET helpful_count = helpful_count - 1 WHERE comment_id = $1',
      [commentId]
    );
  }

  res.json({ success: true });
});

// Get room rating summary
router.get('/rooms/:roomId/rating', async (req, res) => {
  const roomId = req.params.roomId;

  const result = await query(
    `SELECT
       COUNT(*) as total_reviews,
       AVG(rating)::numeric(10,2) as average_rating,
       COUNT(CASE WHEN rating = 5 THEN 1 END) as five_star,
       COUNT(CASE WHEN rating = 4 THEN 1 END) as four_star,
       COUNT(CASE WHEN rating = 3 THEN 1 END) as three_star,
       COUNT(CASE WHEN rating = 2 THEN 1 END) as two_star,
       COUNT(CASE WHEN rating = 1 THEN 1 END) as one_star
     FROM room_comment
     WHERE room_id = $1 AND parent_id IS NULL AND rating IS NOT NULL`,
    [roomId]
  );

  const r = result.rows[0];
  res.json({
    roomId,
    totalReviews: parseInt(r.total_reviews, 10),
    averageRating: parseFloat(r.average_rating) || 0,
    distribution: {
      5: parseInt(r.five_star, 10),
      4: parseInt(r.four_star, 10),
      3: parseInt(r.three_star, 10),
      2: parseInt(r.two_star, 10),
      1: parseInt(r.one_star, 10),
    },
  });
});

// Helper: update room rating aggregate
async function updateRoomRating(roomId) {
  const result = await query(
    `SELECT AVG(rating)::numeric(10,2) as avg, COUNT(*) as cnt
     FROM room_comment WHERE room_id = $1 AND parent_id IS NULL AND rating IS NOT NULL`,
    [roomId]
  );

  if (result.rows.length > 0) {
    const { avg, cnt } = result.rows[0];
    await query(
      `INSERT INTO room_rating (room_id, average_rating, review_count, updated_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (room_id) DO UPDATE SET average_rating = $2, review_count = $3, updated_at = NOW()`,
      [roomId, parseFloat(avg) || 0, parseInt(cnt, 10)]
    );
  }
}

// ============================================================
// HEALTH CHECK
// ============================================================

router.get('/health', (req, res) => {
  res.json({ service: 'roomcomments', status: 'ok' });
});

module.exports = router;



