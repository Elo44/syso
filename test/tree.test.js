import R from 'ramda'
import {expect} from 'chai'
import daggy from 'daggy'
import {Maybe as M} from 'ramda-fantasy'

describe('simplified tree walks', function() {

	// Notre domaine peut se simplifier à une liste d'équations à trous:
	// a: 45
	// b: a + c
	// d: a + 4
	// e: b + d
	// Disons que je veux connaitre "e", alors il va me manquer "c"
	// Si je connais "c", alors je peux calculer "e"
	// Et mon ambition est aussi de pouvoir visualiser le calcul en HTML
	// Donc j'ai une structure plate que je transforme en arbre (ce n'est pas
	// le focus de la présente exploration), je veux pouvoir demander des choses
	// diverses à cet arbre: l'évaluer, repérer les trous, le transformer en HTML

	// Plus tard je vais avoir des trucs plus sophistiqués, par exemple:
	// 	b: a + (bleu: b, vert: c)
	// qui est équivalent à:
	// 	b: b-bleu + b-vert
	// 	b-bleu: a + b
	// 	b-vert: a + c
	// Le but du jeu est de pouvoir le représenter de façon compacte, mais
	// d'avoir un arbre simple à manipuler

	// Pour intégrer dans le simulateur, il faut remplir les exigences
	// suivantes:
	// X décorer l'arbre avec une valeur à chaque noeud
	// - réaliser le calcul de façon efficiente (1 fois par variable)
	// - savoir "court-circuiter" le calcul de variables manquantes dans les conditionnelles
	// - avoir un moyen de gérer les composantes et filtrage

	// Ce qu'on décrit est un framework de programmation déclarative: on stipule des
	// définitions (salaire net = brut - cotisations) mais on les donne sans ordre
	// impératif, on laisse au moteur le soin de calculer les dépendances

	// Chaque élément de notre base de règles est une définition:

	const Def = daggy.taggedSum('Def', {
		Assign: 	 ['name', 'expr']
	})
	const {Assign} = Def

	// Par contre, à l'exécution, il faut bien calculer des "effets de bord"
	// pour rester performant: chaque évaluation d'une définition doit mettre
	// à jour le 'dictionnaire' des valeurs connues, puis le mettre à disposition
	// de la suite du calcul - on verra comment au Chapitre 3

	// La partie droite d'une définition est une expression:

	const Expr = daggy.taggedSum('Expr',{
		Num: ['x'],
		Add: ['x', 'y'],
		Var: ['name']
//		NotIf:  ['condition','formule'],
//		OnlyIf: ['condition','formule'],
//		AnyOf:  ['conditions'],
//		AllOf:  ['conditions'],
	})
	const {Num, Add, Var} = Expr

	// Chapitre 1...

	// Le type Expr est la traduction en JS du type suivant en Haskell,
	// "naivement récursif":
	// data Expr = Num Int | Var String | Add Expr Expr

	// Il se trouve qu'on peut gagner beaucoup en introduisant une petite
	// complexité: on va exprimer la récursion avec un niveau d'indirection,
	// la première étape étant de rendre le type polymorphique sur ce qui
	// est récursif:

	// data ExprF r = Num Int | Var String | Add r r

	// Par exemple, une addition de deux additions c'est de type ExprF (ExprF r),
	// et si je veux décrire des imbrications plus poussées d'additions dans
	// des additions il me faudra un ExprF (ExprF (ExprF r)) et ainsi de
	// suite: on a "déroulé" la récursion dans le type d'origine.

	// On peut alors retrouver le type d'origine en introduisant un
	// "constructeur de point fixe de type", appelé Fx, et en introduisant
	// ce qu'on appelle un "functor type" (c'est le suffixe F)

	// data Expr = Fx ExprF

	// Le point fixe de f est une solution à l'équation x = f x - on
	// peut l'appliquer à des fonctions récursives, voir par exemple:
	// https://www.vex.net/~trebla/haskell/fix.xhtml

	// En JS ça ne marche pas parce que JS est strict et non lazy...

	// Quand au point fixe d'un type, c'est le point fixe de son
	// constructeur: une solution à l'équation T = Fx T

	// En JS c'est juste une fonction qui emballe et une qui déballe:

	const Fx = daggy.tagged('Fx',['x'])
	const unFix = R.prop('x')

	// Les helpers suivants rendent moins pénible la construction de valeurs
	// notamment pour les tests

	let num = x => Fx(Num(M.Just(x)))
	let add = (x, y) => Fx(Add(x,y))
	let ref = (name) => Fx(Var(name))

	// Une application de la théorie des catégories permet de dériver
	// la fonction "fold" suivante, qui généralise aux structures récursives
	// la notion de "reduction" (comme pour les listes), on l'appelle aussi
	// un catamorphisme

	// fold :: Functor f => (f a -> a) -> Fix f -> a
	const fold = R.curry((algebra, x) => R.compose(algebra, R.map(fold(algebra)), unFix)(x))

	// Cf. https://www.schoolofhaskell.com/user/bartosz/understanding-algebras

	// Dans ce contexte, un "algebre" est une fonction qui nous dit comment calculer
	// la réduction pour un noeud à partir des valeurs calculées pour les noeuds fils

	// Cette fonction fournit la traversée
	Expr.prototype.map = function(f) {
		return this.cata({
			Num: (x) => this, // fixed
			Add: (x, y) => Add(f(x), f(y)),
			Var: (name) => this
		})
	}

	// Celle-ci l'évaluation
	const evaluator = state => a => {
		return a.cata({
			Num: (x) => x,
			Add: (x, y) => R.lift(R.add)(x,y),
			Var: (name) => M.toMaybe(state[name]) // Doesn't typecheck
		})
	}

	let evaluate = (expr, state={}) =>
		fold(evaluator(state), expr)
		.getOrElse(null) // for convenience

	// Voici donc l'évaluation d'un arbre...

	it('should provide a protocol for evaluation', function() {
		let tree = num(45),
			result = evaluate(tree)
		expect(result).to.equal(45)
	});

	it('should evaluate expressions', function() {
		let tree = add(num(45),num(25)),
			result = evaluate(tree)
		expect(result).to.equal(70)
	});

	it('should evaluate nested expressions', function() {
		let tree = add(num(45),add(num(15),num(10))),
			result = evaluate(tree)
		expect(result).to.equal(70)
	});

	// Problème: on évalue l'arbre tout entier d'un seul coup; mais
	// peut-on aussi "décorer" l'arbre pendant sa traversée avec les
	// valeurs intermédiaires ? On verra que oui, au Chapitre 2; en
	// attendant on voudrait aussi savoir quelles sont les variables
	// manquantes...

	const collector = state => a => {
		return a.cata({
			Num: (x) => [],
			Add: (x, y) => R.concat(x,y),
			Var: (name) => state[name] ? [] : [name]
		})
	}

	let missing = (expr, state={}) =>
		fold(collector(state), expr)

	it('should evaluate expressions involving variables', function() {
		let tree = add(num(45),ref("a")),
			result = evaluate(tree,{a:25})
		expect(result).to.equal(70)
	});

	it('should evaluate expressions involving missing variables', function() {
		let tree = add(num(45),ref("b")),
			result = evaluate(tree,{a:25})
		expect(result).to.equal(null)
	});

	it('should provide a protocol for missing variables', function() {
		let tree = ref("a"),
			result = missing(tree)
		expect(result).to.deep.equal(["a"])
	});

	it('should locate missing variables in expressions', function() {
		let tree = add(num(45),ref("a")),
			result = missing(tree)
		expect(result).to.deep.equal(["a"])
	});

	it('should locate missing variables in nested expressions', function() {
		let tree = add(add(num(35),ref("a")),num(25)),
			result = missing(tree)
		expect(result).to.deep.equal(["a"])
	});

	it('should locate missing variables in nested expressions', function() {
		let tree = add(add(num(35),ref("a")),num(25)),
			result = missing(tree,{a:25})
		expect(result).to.deep.equal([])
	});

	// Chapitre 2...

	// Pour annoter l'arbre avec les valeurs intermédiaires on utilise un
	// type "Cofree Comonad": ce sont des paires (fst,snd) dont la première
	// valeur est un noeud de l'arbre et la seconde l'annotation; on a un
	// constructeur ann et une fonction de lecture

	// Cf https://github.com/willtim/recursion-schemes/

	const AnnF = daggy.tagged('AnnF',['fr','a'])
	let ann = ({fst, snd}) => Fx(AnnF(fst,snd))
	let nodeValue = annf => {
		let {fr, a} = unFix(annf)
		return a
	}

	// fork est l'opérateur "&&&" de Haskell: (f &&& g) x = Pair(f(x),g(x))
	let fork = (f, g) => x => ({fst:f(x), snd:g(x)})

	// synthesize combine l'application d'un algèbre fourni f et de l'annotation
	let synthesize = f => {
		let algebra = f => R.compose(ann, fork(R.identity, R.compose(f, R.map(nodeValue))))
		return fold(algebra(f))
	}

	let annotate = (state, tree) => synthesize(evaluator(state))(tree)

	it('should annotate tree with evaluation results', function() {
		let tree = add(num(45),add(num(15),num(10))),
			result = nodeValue(annotate({},tree)).getOrElse(null)
		expect(result).to.equal(70)
	});

	// Chapitre 3
});
