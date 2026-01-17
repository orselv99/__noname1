// Korean Text Processing with Enhanced TF-IDF
// Improved: Korean particle stripping, better summary extraction

use regex::Regex;
use std::collections::HashMap;

// ============================================================================
// Types
// ============================================================================

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct TagWithEvidence {
  pub tag: String,
  pub evidence: String,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct ProcessResult {
  pub summary: String,
  pub tags: Vec<TagWithEvidence>,
}

// ============================================================================
// Korean Particle/Suffix Stripping
// ============================================================================

/// Strip Korean particles (조사) and common suffixes from a word
fn strip_korean_suffix(word: &str) -> String {
  let mut result = word.to_string();

  // Order matters: longer suffixes first
  const SUFFIXES: &[&str] = &[
    // 3-char suffixes
    "에서는",
    "으로는",
    "에게는",
    "한테는",
    "로부터",
    "에서도",
    "으로도",
    "이라는",
    "라는것",
    "이라고",
    "라고는",
    "에게서",
    "으로써",
    // 2-char suffixes (most common particles)
    "에서",
    "에게",
    "한테",
    "으로",
    "에는",
    "에도",
    "까지",
    "부터",
    "마저",
    "조차",
    "처럼",
    "같이",
    "보다",
    "만큼",
    "대로",
    "밖에",
    "라고",
    "이라",
    "라는",
    "이란",
    "와는",
    "과는",
    "하고",
    "이고",
    "이며",
    "이나",
    "거나",
    // 1-char suffixes (basic particles - be careful)
    "은",
    "는",
    "이",
    "가",
    "을",
    "를",
    "의",
    "에",
    "와",
    "과",
    "도",
    "만",
    "로",
    "고",
    "며",
    "나",
    "야",
    "여",
    "요",
  ];

  // Try to strip suffixes, but keep at least 2 chars
  for suffix in SUFFIXES {
    if result.ends_with(suffix) {
      let stem_len = result.chars().count() - suffix.chars().count();
      if stem_len >= 2 {
        result = result.chars().take(stem_len).collect();
        break; // Only strip one suffix
      }
    }
  }

  result
}

/// Check if a stemmed word is a stopword
fn is_stemmed_stopword(word: &str) -> bool {
  // Very short words after stemming
  if word.chars().count() < 2 {
    return true;
  }

  // Common verb/adjective stems
  const VERB_STEMS: &[&str] = &[
    "하", "되", "있", "없", "같", "보", "오", "가", "주", "받", "알", "모르", "생각", "말하",
    "느끼", "원하", "바라", "시작", "끝나",
  ];

  // Generic nouns that are too common
  const GENERIC: &[&str] = &[
    "것",
    "수",
    "때",
    "곳",
    "점",
    "측",
    "쪽",
    "면",
    "편",
    "등",
    "바",
    "데",
    "경우",
    "사실",
    "부분",
    "방법",
    "문제",
    "상황",
    "결과",
    "과정",
    "내용",
    "이유",
    "목적",
    "의미",
    "가능",
    "필요",
    "중요",
    "정도",
    "관련",
    "대한",
    "위한",
    "통한",
    "따른",
    "인한",
    "오늘",
    "내일",
    "어제",
    "지금",
    "현재",
    "최근",
    "과거",
    "미래",
    "이후",
    "이전",
    "동안",
    "사이",
    "이상",
    "이하",
    "이내",
    "정도",
    "대부분",
  ];

  // Pronouns
  const PRONOUNS: &[&str] = &[
    "이것", "그것", "저것", "여기", "거기", "저기", "이런", "그런", "저런", "어떤", "무슨", "어느",
    "모든", "각각", "우리", "저희", "당신", "그들", "누구", "무엇", "어디", "언제",
  ];

  // Connectors/Adverbs
  const CONNECTORS: &[&str] = &[
    "그리고",
    "그러나",
    "그래서",
    "그러면",
    "따라서",
    "하지만",
    "그런데",
    "또한",
    "또",
    "및",
    "혹은",
    "아니면",
    "즉",
    "매우",
    "아주",
    "정말",
    "너무",
    "좀",
    "조금",
    "많이",
    "항상",
    "가끔",
    "자주",
    "이미",
    "아직",
    "바로",
    "곧",
    "먼저",
    "다시",
    "계속",
    "아마",
    "혹시",
    "제일",
    "가장",
  ];

  VERB_STEMS.contains(&word)
    || GENERIC.contains(&word)
    || PRONOUNS.contains(&word)
    || CONNECTORS.contains(&word)
}

// ============================================================================
// Word Extraction with Particle Stripping
// ============================================================================

/// Extract and clean Korean words
fn extract_korean_words(text: &str) -> Vec<String> {
  let mut words = Vec::new();
  let korean_re = Regex::new(r"[\uAC00-\uD7A3]{2,}").unwrap();

  for cap in korean_re.find_iter(text) {
    let raw_word = cap.as_str();
    let stemmed = strip_korean_suffix(raw_word);

    // Only keep if meaningful after stemming
    if stemmed.chars().count() >= 2 && !is_stemmed_stopword(&stemmed) {
      words.push(stemmed);
    }
  }

  words
}

/// Extract English words
fn extract_english_words(text: &str) -> Vec<String> {
  let mut words = Vec::new();
  let english_re = Regex::new(r"[a-zA-Z]{3,}").unwrap();

  const EN_STOPWORDS: &[&str] = &[
    "the", "and", "for", "are", "but", "not", "you", "all", "can", "had", "her", "was", "one",
    "our", "out", "has", "have", "been", "were", "they", "this", "that", "with", "from", "will",
    "would", "could", "should", "there", "their", "what", "about", "which", "when", "make", "like",
    "just", "over", "such", "into", "than", "them", "some", "other", "very", "also", "more",
    "most", "only", "even", "much", "many", "any", "each",
  ];

  for cap in english_re.find_iter(text) {
    let word = cap.as_str().to_lowercase();
    if !EN_STOPWORDS.contains(&word.as_str()) {
      words.push(word);
    }
  }

  words
}

// ============================================================================
// TF-IDF with Better Scoring
// ============================================================================

fn calculate_tfidf(words: &[String], top_n: usize) -> Vec<(String, f64)> {
  if words.is_empty() {
    return Vec::new();
  }

  // Count frequencies
  let mut counts: HashMap<String, usize> = HashMap::new();
  for word in words {
    *counts.entry(word.clone()).or_insert(0) += 1;
  }

  let total = words.len() as f64;
  let unique = counts.len() as f64;

  // Find first positions
  let mut first_pos: HashMap<String, usize> = HashMap::new();
  for (i, word) in words.iter().enumerate() {
    first_pos.entry(word.clone()).or_insert(i);
  }

  // Score each word
  let mut scores: Vec<(String, f64)> = counts
    .iter()
    .filter(|(word, count)| {
      // Minimum: appears 2+ times OR is 4+ chars
      **count >= 2 || word.chars().count() >= 4
    })
    .map(|(word, count)| {
      let tf = *count as f64 / total;
      let idf = (unique / (*count as f64 + 1.0)).ln().max(0.1) + 1.0;

      // Position boost (early = important)
      let pos = *first_pos.get(word).unwrap_or(&0) as f64;
      let pos_boost = 1.0 + (0.5 / (1.0 + pos / 30.0));

      // Length boost (longer = more specific)
      let len = word.chars().count() as f64;
      let len_boost = if len >= 4.0 {
        1.5
      } else if len >= 3.0 {
        1.2
      } else {
        1.0
      };

      // Frequency boost (repeated = important)
      let freq_boost = ((*count as f64).sqrt()).min(2.0);

      (word.clone(), tf * idf * pos_boost * len_boost * freq_boost)
    })
    .collect();

  scores.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal));
  scores.into_iter().take(top_n).collect()
}

// ============================================================================
// Improved Summary Extraction
// ============================================================================

/// Split into sentences
fn split_sentences(text: &str) -> Vec<String> {
  let re = Regex::new(r"[.!?。]\s*").unwrap();
  re.split(text)
    .filter(|s| s.trim().chars().count() > 15)
    .map(|s| {
      let trimmed = s.trim();
      if trimmed.chars().count() > 200 {
        trimmed.chars().take(200).collect::<String>() + "..."
      } else {
        trimmed.to_string()
      }
    })
    .collect()
}

/// Score sentences based on keywords and informativeness
fn score_sentence(
  sentence: &str,
  index: usize,
  keywords: &[(String, f64)],
  total_sentences: usize,
) -> f64 {
  let mut score = 0.0;

  // 1. Keyword presence (most important)
  for (keyword, kw_score) in keywords {
    if sentence.contains(keyword) {
      score += kw_score * 2.0;
    }
  }

  // 2. Position score - prefer middle sentences (skip intro/conclusion)
  let pos_ratio = index as f64 / total_sentences.max(1) as f64;
  let pos_score = if pos_ratio < 0.2 {
    0.5 // First 20% - might be intro
  } else if pos_ratio > 0.8 {
    0.3 // Last 20% - might be conclusion
  } else {
    1.0 // Middle 60% - likely main content
  };
  score += pos_score;

  // 3. Length score - prefer medium length
  let len = sentence.chars().count();
  let len_score = if len > 50 && len < 150 {
    1.0
  } else if len > 30 && len < 200 {
    0.7
  } else {
    0.3
  };
  score += len_score;

  // 4. Information density - count content words
  let content_word_count = sentence
    .split_whitespace()
    .filter(|w| w.chars().count() >= 2)
    .count();
  let density_score = (content_word_count as f64 / 10.0).min(1.0);
  score += density_score;

  score
}

/// Extract summary by selecting best sentences
fn extract_summary(
  sentences: &[String],
  keywords: &[(String, f64)],
  max_sentences: usize,
) -> String {
  if sentences.is_empty() {
    return String::new();
  }

  if sentences.len() <= max_sentences {
    return sentences.join(". ") + ".";
  }

  // Score all sentences
  let total = sentences.len();
  let mut scored: Vec<(usize, f64)> = sentences
    .iter()
    .enumerate()
    .map(|(i, s)| (i, score_sentence(s, i, keywords, total)))
    .collect();

  scored.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal));

  // Take top sentences, maintain original order
  let mut selected: Vec<usize> = scored
    .into_iter()
    .take(max_sentences)
    .map(|(i, _)| i)
    .collect();
  selected.sort();

  let summary: Vec<&str> = selected
    .iter()
    .filter_map(|&i| sentences.get(i).map(|s| s.as_str()))
    .collect();

  summary.join(". ") + "."
}

// ============================================================================
// Evidence Finding
// ============================================================================

fn find_evidence(sentences: &[String], keyword: &str) -> String {
  // Find sentences containing the keyword
  let matches: Vec<&String> = sentences.iter().filter(|s| s.contains(keyword)).collect();

  if matches.is_empty() {
    return sentences.first().cloned().unwrap_or_default();
  }

  // Prefer shorter sentences as evidence (more focused)
  let mut sorted = matches.clone();
  sorted.sort_by_key(|s| s.chars().count());

  sorted.first().cloned().cloned().unwrap_or_default()
}

// ============================================================================
// Main Processing
// ============================================================================

pub fn process_document(text: &str) -> ProcessResult {
  let clean_text = clean_text(text);

  if clean_text.chars().count() < 20 {
    return ProcessResult {
      summary: clean_text.clone(),
      tags: Vec::new(),
    };
  }

  // 1. Extract words with particle stripping
  let mut words = extract_korean_words(&clean_text);
  words.extend(extract_english_words(&clean_text));

  // 2. Calculate TF-IDF for top 5 keywords
  let keywords = calculate_tfidf(&words, 5);

  // 3. Split into sentences
  let sentences = split_sentences(&clean_text);

  // 4. Extract summary (best 2 sentences based on keywords)
  let summary = if sentences.len() > 2 {
    extract_summary(&sentences, &keywords, 2)
  } else if !sentences.is_empty() {
    sentences.join(". ") + "."
  } else {
    clean_text.chars().take(200).collect()
  };

  // 5. Get top 3 keywords as tags
  let tags: Vec<TagWithEvidence> = keywords
    .into_iter()
    .take(3)
    .map(|(kw, _)| TagWithEvidence {
      evidence: find_evidence(&sentences, &kw),
      tag: kw,
    })
    .collect();

  ProcessResult { summary, tags }
}

/// Clean text for processing
fn clean_text(input: &str) -> String {
  // Remove HTML
  let mut no_html = String::with_capacity(input.len());
  let mut in_tag = false;
  for c in input.chars() {
    match c {
      '<' => in_tag = true,
      '>' if in_tag => in_tag = false,
      _ if !in_tag => no_html.push(c),
      _ => {}
    }
  }

  // Remove markdown
  let s = no_html
    .replace("```", " ")
    .replace("**", "")
    .replace("__", "")
    .replace("==", "")
    .replace("~~", "")
    .replace("[[", "")
    .replace("]]", "");

  let s: String = s
    .chars()
    .filter(|&c| c != '*' && c != '#' && c != '`' && c != '~')
    .collect();

  // Normalize whitespace
  let mut result = String::with_capacity(s.len());
  let mut last_ws = false;
  for c in s.chars() {
    if c.is_whitespace() {
      if !last_ws {
        result.push(' ');
        last_ws = true;
      }
    } else {
      result.push(c);
      last_ws = false;
    }
  }

  result.trim().to_string()
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn test_strip_suffix() {
    assert_eq!(strip_korean_suffix("인공지능은"), "인공지능");
    assert_eq!(strip_korean_suffix("기술이"), "기술");
    assert_eq!(strip_korean_suffix("발전하고"), "발전하");
    assert_eq!(strip_korean_suffix("연구에서"), "연구");
  }

  #[test]
  fn test_process() {
    let text = "인공지능 기술은 현대 사회를 변화시키고 있습니다. 특히 딥러닝과 머신러닝의 발전이 두드러집니다. 자연어 처리 분야에서 큰 성과를 거두고 있습니다. 인공지능 연구는 계속해서 발전하고 있습니다.";
    let result = process_document(text);

    println!("Summary: {}", result.summary);
    for t in &result.tags {
      println!("Tag: {} | Evidence: {}", t.tag, t.evidence);
    }

    // Tags should not contain particles
    for t in &result.tags {
      assert!(!t.tag.ends_with("은"));
      assert!(!t.tag.ends_with("는"));
      assert!(!t.tag.ends_with("이"));
      assert!(!t.tag.ends_with("가"));
    }
  }
}
