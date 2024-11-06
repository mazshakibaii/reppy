/// Reverses the characters in the given string slice.
/// 
/// # Arguments
/// 
/// * `input` - A string slice that will be reversed.
/// 
/// # Returns
/// 
/// A new `String` containing the characters of the input string in reverse order.
fn reverse_string(input: &str) -> String {
    input.chars().rev().collect()
}

/// Calculates the nth Fibonacci number.
/// 
/// # Arguments
/// 
/// * `n` - The position in the Fibonacci sequence (0-based) for which to calculate the Fibonacci number.
/// 
/// # Returns
/// 
/// The nth Fibonacci number as a u64.
fn fibonacci(n: u32) -> u64 {
    match n {
        0 => 0,
        1 => 1,
        _ => {
            let mut a = 0;
            let mut b = 1;
            for _ in 0..n-1 {
                let temp = a + b;
                a = b;
                b = temp;
            }
            b
        }
    }
}

/// Splits a slice into a vector of vectors, each containing a specified number of elements.
/// 
/// # Arguments
/// 
/// * `vec` - A slice of elements to be split into chunks.
/// * `chunk_size` - The maximum number of elements each chunk can contain.
/// 
/// # Returns
/// 
/// A vector of vectors, where each inner vector contains up to `chunk_size` elements from the original slice.
fn chunk_vec<T: Clone>(vec: &[T], chunk_size: usize) -> Vec<Vec<T>> {
    vec.chunks(chunk_size)
        .map(|chunk| chunk.to_vec())
        .collect()
}

/// Removes duplicate elements from a slice and returns a new vector containing only unique elements.
/// 
/// # Arguments
/// 
/// * `vec` - A slice of elements of type T, where T implements the Eq, Hash, and Clone traits.
/// 
/// # Returns
/// 
/// A vector containing the unique elements from the input slice, preserving the order of their first occurrence.
fn remove_duplicates<T: Eq + std::hash::Hash + Clone>(vec: &[T]) -> Vec<T> {
    let mut seen = std::collections::HashSet::new();
    vec.iter()
        .filter(|item| seen.insert((*item).clone()))
        .cloned()
        .collect()
}

/// Performs a binary search on a sorted slice to find the index of a target value.
/// 
/// # Arguments
/// 
/// * `arr` - A sorted slice of elements of type `T` to search through.
/// * `target` - A reference to the target value of type `T` to find in the slice.
/// 
/// # Returns
/// 
/// An `Option<usize>` that contains the index of the target value if found, or `None` if the target is not present in the slice.
fn binary_search<T: Ord>(arr: &[T], target: &T) -> Option<usize> {
    let mut left = 0;
    let mut right = arr.len();

    while left < right {
        let mid = left + (right - left) / 2;
        match arr[mid].cmp(target) {
            std::cmp::Ordering::Equal => return Some(mid),
            std::cmp::Ordering::Less => left = mid + 1,
            std::cmp::Ordering::Greater => right = mid,
        }
    }
    None
}

/// Merges two sorted slices into a single sorted vector.
/// 
/// # Arguments
/// 
/// * `a` - A slice of elements of type `T`, which must implement the `Ord` and `Clone` traits, representing the first sorted collection.
/// * `b` - A slice of elements of type `T`, which must implement the `Ord` and `Clone` traits, representing the second sorted collection.
/// 
/// # Returns
/// 
/// A vector containing all elements from both input slices, sorted in ascending order.
fn merge_sorted_vecs<T: Ord + Clone>(a: &[T], b: &[T]) -> Vec<T> {
    let mut result = Vec::with_capacity(a.len() + b.len());
    let mut i = 0;
    let mut j = 0;
    
    while i < a.len() && j < b.len() {
        if a[i] <= b[j] {
            result.push(a[i].clone());
            i += 1;
        } else {
            result.push(b[j].clone());
            j += 1;
        }
    }
    
    result.extend_from_slice(&a[i..]);
    result.extend_from_slice(&b[j..]);
    result
}